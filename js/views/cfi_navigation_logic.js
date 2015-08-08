//  LauncherOSX
//
//  Created by Boris Schneiderman.
//  Copyright (c) 2014 Readium Foundation and/or its licensees. All rights reserved.
//  
//  Redistribution and use in source and binary forms, with or without modification, 
//  are permitted provided that the following conditions are met:
//  1. Redistributions of source code must retain the above copyright notice, this 
//  list of conditions and the following disclaimer.
//  2. Redistributions in binary form must reproduce the above copyright notice, 
//  this list of conditions and the following disclaimer in the documentation and/or 
//  other materials provided with the distribution.
//  3. Neither the name of the organization nor the names of its contributors may be 
//  used to endorse or promote products derived from this software without specific 
//  prior written permission.
//  
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
//  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
//  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. 
//  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, 
//  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, 
//  BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, 
//  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE 
//  OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
//  OF THE POSSIBILITY OF SUCH DAMAGE.

/**
 * CFI navigation helper class
 *
 * @param $viewport
 * @param $iframe
 * @param options Additional settings for NavigationLogic object
 *      - rectangleBased    If truthy, clientRect-based geometry will be used
 *      - paginationInfo    Layout details, used by clientRect-based geometry
 * @constructor
 */
define(["jquery", "underscore", "../helpers", 'readium_cfi_js'], function($, _, Helpers, epubCfi) {

var CfiNavigationLogic = function($viewport, $iframe, options){

    options = options || {};

    this.getRootElement = function(){
        return $iframe[0].contentDocument.documentElement;
    };

    /**
     * @private
     * Checks whether or not pages are rendered right-to-left
     *
     * @returns {boolean}
     */
    function isPageProgressionRightToLeft() {
        return options.paginationInfo && !!options.paginationInfo.rightToLeft;
    }

    /**
     * @private
     * Checks whether or not pages are rendered with vertical writing mode
     *
     * @returns {boolean}
     */
    function isVerticalWritingMode() {
        return options.paginationInfo && !!options.paginationInfo.isVerticalWritingMode;
    }


    /**
     * @private
     * Checks whether or not a (fully adjusted) rectangle is at least partly visible
     *
     * @param {Object} rect
     * @param {Object} frameDimensions
     * @param {boolean} [isVwm]           isVerticalWritingMode
     * @returns {boolean}
     */
    function isRectVisible(rect, frameDimensions, isVwm) {
        if (isVwm) {
            return rect.top >= 0 && rect.top < frameDimensions.height;
        }
        return rect.left >= 0 && rect.left < frameDimensions.width;
    }

    /**
     * @private
     * Retrieves _current_ full width of a column (including its gap)
     *
     * @returns {number} Full width of a column in pixels
     */
    function getColumnFullWidth() {
        if (!options.paginationInfo || isVerticalWritingMode()) {
            return $iframe.width();
        }

        return options.paginationInfo.columnWidth + options.paginationInfo.columnGap;
    }

    /**
     * @private
     *
     * Retrieves _current_ offset of a viewport
     * (related to the beginning of the chapter)
     *
     * @returns {Object}
     */
    // function getVisibleContentOffsets() {
    //     if(isVerticalWritingMode()){
    //         return {
    //             top: (options.paginationInfo ? options.paginationInfo.pageOffset : 0)
    //         };
    //     }
    //     return {
    //         left: (options.paginationInfo ? options.paginationInfo.pageOffset : 0) *
    //           (isPageProgressionRightToLeft() ? -1 : 1)
    //     };
    // }

    // Old (offsetTop-based) algorithm, useful in top-to-bottom layouts
    function checkVisibilityByVerticalOffsets(
        $element, visibleContentOffsets, shouldCalculateVisibilityOffset) {

        var elementRect = Helpers.Rect.fromElement($element);
        if (_.isNaN(elementRect.left)) {
            // this is actually a point element, doesnt have a bounding rectangle
            elementRect = new Helpers.Rect(
                $element.position().top, $element.position().left, 0, 0);
        }
        var topOffset = visibleContentOffsets.top || 0;
        var isBelowVisibleTop = elementRect.bottom() > topOffset;
        var isAboveVisibleBottom = visibleContentOffsets.bottom !== undefined ?
          elementRect.top < visibleContentOffsets.bottom
            : true; //this check always passed, if corresponding offset isn't set

        var percentOfElementHeight = 0;
        if (isBelowVisibleTop && isAboveVisibleBottom) { // element is visible
            if (!shouldCalculateVisibilityOffset) {
                return 100;
            }
            else if (elementRect.top <= topOffset) {
                percentOfElementHeight = Math.ceil(
                        100 * (topOffset - elementRect.top) / elementRect.height
                );

                // below goes another algorithm, which has been used in getVisibleElements pattern,
                // but it seems to be a bit incorrect
                // (as spatial offset should be measured at the first visible point of the element):
                //
                // var visibleTop = Math.max(elementRect.top, visibleContentOffsets.top);
                // var visibleBottom = Math.min(elementRect.bottom(), visibleContentOffsets.bottom);
                // var visibleHeight = visibleBottom - visibleTop;
                // var percentVisible = Math.round((visibleHeight / elementRect.height) * 100);
            }
            return 100 - percentOfElementHeight;
        }
        return 0; // element isn't visible
    }

    /**
     * New (rectangle-based) algorithm, useful in multi-column layouts
     *
     * Note: the second param (props) is ignored intentionally
     * (no need to use those in normalization)
     *
     * @param {jQuery} $element
     * @param {Object} _props
     * @param {boolean} shouldCalculateVisibilityPercentage
     * @returns {number|null}
     *      0 for non-visible elements,
     *      0 < n <= 100 for visible elements
     *      (will just give 100, if `shouldCalculateVisibilityPercentage` => false)
     *      null for elements with display:none
     */
    function checkVisibilityByRectangles(
        $element, _props, shouldCalculateVisibilityPercentage) {

        var elementRectangles = getNormalizedRectangles($element);
        var clientRectangles = elementRectangles.clientRectangles;
        if (clientRectangles.length === 0) { // elements with display:none, etc.
            return null;
        }

        var isRtl = isPageProgressionRightToLeft();
        var isVwm = isVerticalWritingMode();
        var columnFullWidth = getColumnFullWidth();
        var frameDimensions = {
            width: $iframe.width(),
            height: $iframe.height()
        };

        if (clientRectangles.length === 1) {
            // because of webkit inconsistency, that single rectangle should be adjusted
            // until it hits the end OR will be based on the FIRST column that is visible
            adjustRectangle(clientRectangles[0], frameDimensions, columnFullWidth,
                isRtl, isVwm, true);
        }

        // for an element split between several CSS columns,
        // both Firefox and IE produce as many client rectangles;
        // each of those should be checked
        var visibilityPercentage = 0;
        for (var i = 0, l = clientRectangles.length; i < l; ++i) {
            if (isRectVisible(clientRectangles[i], frameDimensions, isVwm)) {
                visibilityPercentage = shouldCalculateVisibilityPercentage ?
                  measureVisibilityPercentageByRectangles(clientRectangles, frameDimensions, i)
                    : 100;
                break;
            }
        }
        return visibilityPercentage;
    }

    var visibilityCheckerFunc = options.rectangleBased ? checkVisibilityByRectangles : checkVisibilityByVerticalOffsets;

    /**
     * Finds a page index (0-based) for a specific element.
     * Calculations are based on rectangles retrieved with getClientRects() method.
     *
     * @param {jQuery} $element
     * @param {number} spatialVerticalOffset
     * @returns {number|null}
     */
    // function findPageByRectangles($element, spatialVerticalOffset) {
    //     var visibleContentOffsets = getVisibleContentOffsets();
    //     var elementRectangles = getNormalizedRectangles($element, visibleContentOffsets);
    //     var clientRectangles  = elementRectangles.clientRectangles;
    //     if (clientRectangles.length === 0) { // elements with display:none, etc.
    //         return null;
    //     }
    //
    //     var isRtl = isPageProgressionRightToLeft();
    //     var isVwm = isVerticalWritingMode();
    //     var columnFullWidth = getColumnFullWidth();
    //
    //     var frameHeight = $iframe.height();
    //     var frameWidth  = $iframe.width();
    //
    //     if (spatialVerticalOffset) {
    //         trimRectanglesByVertOffset(clientRectangles, spatialVerticalOffset,
    //             frameHeight, columnFullWidth, isRtl, isVwm);
    //     }
    //
    //     var firstRectangle = _.first(clientRectangles);
    //     if (clientRectangles.length === 1) {
    //         adjustRectangle(firstRectangle, {
    //             height: frameHeight, width: frameWidth
    //         }, columnFullWidth, isRtl, isVwm);
    //     }
    //
    //     var pageIndex;
    //
    //     if (isVwm) {
    //         var topOffset = firstRectangle.top;
    //         pageIndex = Math.floor(topOffset / frameHeight);
    //     } else {
    //         var leftOffset = firstRectangle.left;
    //         if (isRtl) {
    //             leftOffset = (columnFullWidth * (options.paginationInfo ? options.paginationInfo.visibleColumnCount : 1)) - leftOffset;
    //         }
    //         pageIndex = Math.floor(leftOffset / columnFullWidth);
    //     }
    //
    //     if (pageIndex < 0) {
    //         pageIndex = 0;
    //     }
    //     else if (pageIndex >= (options.paginationInfo ? options.paginationInfo.columnCount : 1)) {
    //         pageIndex = (options.paginationInfo ? (options.paginationInfo.columnCount - 1) : 0);
    //     }
    //
    //     return pageIndex;
    // }

    /**
     * @private
     * Calculates the visibility offset percentage based on ClientRect dimensions
     *
     * @param {Array} clientRectangles (should already be normalized)
     * @param {number} firstVisibleRectIndex
     * @returns {number} - visibility percentage (0 < n <= 100)
     */
    function measureVisibilityPercentageByRectangles(
        clientRectangles, frameDimensions, firstVisibleRectIndex) {

        var heightTotal = 0;
        var heightVisible = 0;

        if (clientRectangles.length > 1) {
            _.each(clientRectangles, function(rect, index) {
                heightTotal += rect.height;
                if (index >= firstVisibleRectIndex) {
                    // in this case, all the rectangles after the first visible
                    // should be counted as visible
                    heightVisible += rect.height;
                }
            });
        }
        else {
            // should already be normalized and adjusted
            heightTotal   = clientRectangles[0].height;
            heightVisible = clientRectangles[0].height - Math.max(
                0, -clientRectangles[0].top);
            if (clientRectangles[0].bottom > frameDimensions.height) {
                heightVisible = clientRectangles[0].height - (clientRectangles[0].bottom - frameDimensions.height);
            }
        }
        return heightVisible === heightTotal ?
          100 // trivial case: element is 100% visible
            : Math.floor(100 * heightVisible / heightTotal);
    }

    /**
     * @private
     * Retrieves the position of $element in multi-column layout
     *
     * @param {jQuery} $el
     * @param {Object} [visibleContentOffsets]
     * @returns {Object}
     */
    function getNormalizedRectangles($el, visibleContentOffsets) {

        visibleContentOffsets = visibleContentOffsets || {};
        var leftOffset = visibleContentOffsets.left || 0;
        var topOffset  = visibleContentOffsets.top  || 0;

        // union of all rectangles wrapping the element
        var wrapperRectangle = normalizeRectangle(
            $el[0].getBoundingClientRect(), leftOffset, topOffset);

        // all the separate rectangles (for detecting position of the element
        // split between several columns)
        var clientRectangles = [];
        var clientRectList = $el[0].getClientRects();
        for (var i = 0, l = clientRectList.length; i < l; ++i) {
            if (clientRectList[i].height > 0) {
                // Firefox sometimes gets it wrong,
                // adding literally empty (height = 0) client rectangle preceding the real one,
                // that empty client rectanle shouldn't be retrieved
                clientRectangles.push(
                    normalizeRectangle(clientRectList[i], leftOffset, topOffset));
            }
        }

        if (clientRectangles.length === 0) {
            // sometimes an element is either hidden or empty, and that means
            // Webkit-based browsers fail to assign proper clientRects to it
            // in this case we need to go for its sibling (if it exists)
            $el = $el.next();
            if ($el.length) {
                return getNormalizedRectangles($el, visibleContentOffsets);
            }
        }

        return {
            wrapperRectangle: wrapperRectangle,
            clientRectangles: clientRectangles
        };
    }

    /**
     * @private
     * Converts TextRectangle object into a plain object,
     * taking content offsets (=scrolls, position shifts etc.) into account
     *
     * @param {TextRectangle} textRect
     * @param {number} leftOffset
     * @param {number} topOffset
     * @returns {Object}
     */
    function normalizeRectangle(textRect, leftOffset, topOffset) {

        var plainRectObject = {
            left: textRect.left,
            right: textRect.right,
            top: textRect.top,
            bottom: textRect.bottom,
            width: textRect.right - textRect.left,
            height: textRect.bottom - textRect.top
        };
        offsetRectangle(plainRectObject, leftOffset, topOffset);
        return plainRectObject;
    }

    /**
     * @private
     * Offsets plain object (which represents a TextRectangle).
     *
     * @param {Object} rect
     * @param {number} leftOffset
     * @param {number} topOffset
     */
    function offsetRectangle(rect, leftOffset, topOffset) {

        rect.left   += leftOffset;
        rect.right  += leftOffset;
        rect.top    += topOffset;
        rect.bottom += topOffset;
    }

    /**
     * @private
     *
     * When element is spilled over two or more columns,
     * most of the time Webkit-based browsers
     * still assign a single clientRectangle to it, setting its `top` property to negative value
     * (so it looks like it's rendered based on the second column)
     * Alas, sometimes they decide to continue the leftmost column - from _below_ its real height.
     * In this case, `bottom` property is actually greater than element's height and had to be adjusted accordingly.
     *
     * Ugh.
     *
     * @param {Object} rect
     * @param {Object} frameDimensions
     * @param {number} columnFullWidth
     * @param {boolean} isRtl
     * @param {boolean} isVwm               isVerticalWritingMode
     * @param {boolean} shouldLookForFirstVisibleColumn
     *      If set, there'll be two-phase adjustment
     *      (to align a rectangle with a viewport)

     */
    function adjustRectangle(rect, frameDimensions, columnFullWidth, isRtl, isVwm,
                             shouldLookForFirstVisibleColumn) {

        // Rectangle adjustment is not needed in VWM since it does not deal with columns
        if (isVwm) {
            return;
        }

        if (isRtl) {
            columnFullWidth *= -1; // horizontal shifts are reverted in RTL mode
        }

        // first we go left/right (rebasing onto the very first column available)
        while (rect.top < 0) {
            offsetRectangle(rect, -columnFullWidth, frameDimensions.height);
        }

        // ... then, if necessary (for visibility offset checks),
        // each column is tried again (now in reverse order)
        // the loop will be stopped when the column is aligned with a viewport
        // (i.e., is the first visible one).
        if (shouldLookForFirstVisibleColumn) {
            while (rect.bottom >= frameDimensions.height) {
                if (isRectVisible(rect, frameDimensions, isVwm)) {
                    break;
                }
                offsetRectangle(rect, columnFullWidth, -frameDimensions.height);
            }
        }
    }

    /**
     * @private
     * Trims the rectangle(s) representing the given element.
     *
     * @param {Array} rects
     * @param {number} verticalOffset
     * @param {number} frameHeight
     * @param {number} columnFullWidth
     * @param {boolean} isRtl
     * @param {boolean} isVwm               isVerticalWritingMode
     */
    // function trimRectanglesByVertOffset(
    //     rects, verticalOffset, frameHeight, columnFullWidth, isRtl, isVwm) {
    //
    //     //TODO: Support vertical writing mode
    //     if (isVwm) {
    //         return;
    //     }
    //
    //     var totalHeight = _.reduce(rects, function(prev, cur) {
    //         return prev + cur.height;
    //     }, 0);
    //
    //     var heightToHide = totalHeight * verticalOffset / 100;
    //     if (rects.length > 1) {
    //         var heightAccum = 0;
    //         do {
    //             heightAccum += rects[0].height;
    //             if (heightAccum > heightToHide) {
    //                 break;
    //             }
    //             rects.shift();
    //         } while (rects.length > 1);
    //     }
    //     else {
    //         // rebase to the last possible column
    //         // (so that adding to top will be properly processed later)
    //         if (isRtl) {
    //             columnFullWidth *= -1;
    //         }
    //         while (rects[0].bottom >= frameHeight) {
    //             offsetRectangle(rects[0], columnFullWidth, -frameHeight);
    //         }
    //
    //         rects[0].top += heightToHide;
    //         rects[0].height -= heightToHide;
    //     }
    // }

    function isValidTextNode(node) {
      return node.nodeType === Node.TEXT_NODE &&
              node.nodeValue.trim().length > 0;
    }

    this.getElementById = function(id) {

        var contentDoc = $iframe[0].contentDocument;

        var $element = $(contentDoc.getElementById(id));
        //$("#" + Helpers.escapeJQuerySelector(id), contentDoc);

        if($element.length === 0) {
            return undefined;
        }

        return $element;
    };

    /**
     * TODO:(MDA) This is a combination of the find(First|Last) functions. Combining
     * should improve performance and ease maintenance.
     **/
    this.findVisibleElementBounds = function(props) {
        //TODO:(MDA) Remove this legacy check and fix legacy code.
        if (typeof props !== 'object') {
            // compatibility with legacy code, `props` is `topOffset` actually
            props = { top: props };
        }

        var $elements;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var characterOffset = 0;
        var self = this;

        var firstNodeData = null;
        var lastNodeData = null;
        var $previousElement = null;

        // find all the elements that are text nodes or imgs. Should others be here also?
        $elements = $("body", this.getRootElement()).find("*").contents().andSelf().filter(function () {
            return isValidTextNode(this) || this.nodeName.toLowerCase() === 'img';
        });

        // Find the visible node bounds
        $.each($elements, function() {

            var $element;

            if(this.nodeType === Node.TEXT_NODE) {
                $element = $(this).parent();
            } else {
                $element = $(this);
            }

            var visibilityResult = visibilityCheckerFunc($element, props, true);
            if (visibilityResult && !firstNodeData) {
                characterOffset = 0;
                $firstVisibleTextNode = $element;
                if (this.nodeType === Node.TEXT_NODE) {
                    /* find the character offset that is first visible */
                    $firstVisibleTextNode = $(this);
                    if (visibilityResult === 100) {
                        characterOffset = $firstVisibleTextNode[0].length;
                    }
                    characterOffset = self.findFirstVisibleTextOffset($element, $firstVisibleTextNode, props);
                    if (characterOffset === this.nodeValue.length) {
                        // none of the content of this text node was visible
                        $previousElement = $element;
                        return true;
                    }
                }

                percentOfElementHeight = 100 - visibilityResult;
                firstNodeData = {$element: $firstVisibleTextNode, percentY: percentOfElementHeight, textOffset: characterOffset};

                $previousElement = $element;
                return true;
            } else if (visibilityResult < 100 && firstNodeData) {
                // We have the first node and just left the visible nodes
                if (visibilityResult === 0) {
                    // if the element went from 100 -> 0 then go back an element
                    $element = $previousElement;
                }
                lastNodeData = this.checkLastVisibleTextOffset($element, visibilityResult, props);
                if (lastNodeData) {
                    return false;
                }
                $previousElement = $element;
                return true;
            }

            $previousElement = $element;
            return true;
        });

        // only 1 node on the screen - common with covers or full page figures/images
        if (!lastNodeData && $previousElement) {
            lastNodeData = this.checkLastVisibleTextOffset($previousElement, 100, props);
        }

        return {firstNode: firstNodeData, lastNode: lastNodeData};
    };

    this.checkLastVisibleTextOffset = function($element, visibilityResult, props) {
        var characterOffset = 0;
        var $lastVisibleTextNode = $element;
        var percentOfElementHeight;
        if (this.nodeType === Node.TEXT_NODE) {
            /* find the character offset that is first visible */
            $lastVisibleTextNode = $(this);
            if (visibilityResult === 100) {
                characterOffset = 0;
            } else {
                characterOffset = self.findLastVisibleTextOffset($element, $lastVisibleTextNode, props);
            }

            if (characterOffset === this.nodeValue.length) {
                // none of the content of this text node was visible
                return null;
            }
        }

        percentOfElementHeight = 100 - visibilityResult;
        return {$element: $lastVisibleTextNode, percentY: percentOfElementHeight, textOffset: characterOffset};
    };

    /* we look for text and images */
    this.findFirstVisibleElement = function (props) {

        if (typeof props !== 'object') {
            // compatibility with legacy code, `props` is `topOffset` actually
            props = { top: props };
        }

        var $elements;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var characterOffset = 0;
        var self = this;

        $elements = $("body", this.getRootElement()).find("*").contents().andSelf().filter(function () {
            return isValidTextNode(this) || this.nodeName.toLowerCase() === 'img';
        });

        // Find the first visible text node
        $.each($elements, function() {

            var $element;

            $element = $(this);
            if(this.nodeType === Node.TEXT_NODE) {
                $element = $(this).parent();
            } else {
                $element = $(this);
            }

            var visibilityResult = visibilityCheckerFunc($element, props, true);
            if (visibilityResult) {
                characterOffset = 0;
                $firstVisibleTextNode = $element;
                if (this.nodeType === Node.TEXT_NODE) {
                    /* find the character offset that is first visible */
                    $firstVisibleTextNode = $(this);
                    if (visibilityResult == 100) {
                        characterOffset = $firstVisibleTextNode[0].length;
                    }
                    characterOffset = self.findFirstVisibleTextOffset($element, $firstVisibleTextNode, props);
                    if (characterOffset == this.nodeValue.length) {
                        // none of the content of this text node was visible
                        return true;
                    }
                }

                percentOfElementHeight = 100 - visibilityResult;
                return false;
            }
            return true;
        });

        return {$element: $firstVisibleTextNode, percentY: percentOfElementHeight, textOffset: characterOffset};
    };

    this.hasCaretRangeFromPoint = function() {
        var doc = $iframe[0].contentDocument;
        return doc.caretPositionFromPoint || doc.caretRangeFromPoint;
    };

    this.compatibleCaretRangeFromPoint = function(doc, x, y) {
        if (!doc) {
            return null;
        }

        var caretPosition;

        // standard
        if (doc.caretPositionFromPoint) {
            caretPosition = doc.caretPositionFromPoint(x, y);
        } else if (doc.caretRangeFromPoint) {
            // WebKit
            caretPosition = doc.caretRangeFromPoint(x, y);
            if (caretPosition) {
                caretPosition.offsetNode = caretPosition.startContainer;
                caretPosition.offset = caretPosition.startOffset;
            }
        }

        return caretPosition;
    };

    this.findVisibleNodeWithTextOffset = function(doc, fromStart, leftOffset) {
        //TODO:(MDA)this needs to be moved up the call
        if (!this.hasCaretRangeFromPoint()) {
          if (fromStart) {
            return this.findFirstVisibleElement(leftOffset);
          } else {
            return this.findLastVisibleElement(leftOffset);
          }
        }

        // Now we can get a proper range value
        var i = 1;
        var caretPosition, frameWidth, frameHeight;
        if (!fromStart) {
            frameWidth = $("html", doc).width();
            frameHeight = $("html", doc).height();
        }
        do {
            var posX, posY;
            if (fromStart) {
                posX = i;
                posY = i;
            } else {
                posX = frameWidth - i;
                posY = frameHeight - i;
            }

            caretPosition = this.compatibleCaretRangeFromPoint(doc, posX, posY);
            i++;
            // (MDA) See below - why check html and body here, but look for non-empty text nodes and imgs below?
        } while (caretPosition && ($(caretPosition.offsetNode).is('html') || $(caretPosition.offsetNode).is('body')));

        console.log("Caret position found: ", caretPosition, fromStart);

        var node = (caretPosition) ? caretPosition.offsetNode : null;
        var offset = (caretPosition) ? caretPosition.offset : 0;
        var elementRect = (node) ? Helpers.Rect.fromElement($(node.parentNode)) : null;
        var percentOfElementHeight = (elementRect) ? Math.ceil((-elementRect.top / elementRect.height) * 100) : 0;

        return {$element: $(node), percentY: percentOfElementHeight, textOffset: offset };
    };

    this.findFirstVisibleNodeWithTextOffset = function (leftOffset) {
        var iframeDoc = $iframe[0].contentDocument;
        return this.findVisibleNodeWithTextOffset(iframeDoc, true, leftOffset);
    };

    this.findLastVisibleElement = function (props) {

        if (typeof props !== 'object') {
            // compatibility with legacy code, `props` is `topOffset` actually
            props = { top: props };
        }

        var $elements;
        var $lastVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var characterOffset = 0;
        var self = this;

        $elements = $("body", this.getRootElement()).find("*").contents().andSelf().filter(function () {
            return isValidTextNode(this) || this.nodeName.toLowerCase() === 'img';
        }).get().reverse();

        // Find the first visible text node
        $.each($elements, function() {

            var $element;

            if(this.nodeType === Node.TEXT_NODE)  { //text node
                $element = $(this).parent();
            }
            else {
                $element = $(this); //image
            }

            var visibilityResult = visibilityCheckerFunc($element, props, true);
            if (visibilityResult) {
                characterOffset = 0;
                $lastVisibleTextNode = $element;
                if (this.nodeType === Node.TEXT_NODE) {
                    /* find the character offset that is first visible */
                    $lastVisibleTextNode = $(this);
                    if (visibilityResult == 100) {
                        characterOffset = 0;
                    }
                    characterOffset = self.findLastVisibleTextOffset($element, $lastVisibleTextNode, props);
                    if (characterOffset == this.nodeValue.length) {
                        // none of the content of this text node was visible
                        return true;
                    }
                }

                percentOfElementHeight = 100 - visibilityResult;
                return false;
            }
            return true;
        });

        return {$element: $lastVisibleTextNode, percentY: percentOfElementHeight, textOffset: characterOffset};
    };

    this.findLastVisibleNodeWithTextOffset = function (leftOffset) {
        var iframeDoc = $iframe[0].contentDocument;
        return this.findVisibleNodeWithTextOffset(iframeDoc, false, leftOffset);
    };

    //TODO:(MDA) This is mostly a copy of findLastVisibleTextOffset. Refactor to remove duplicate
    // code and eventually move to the bounds call.
    this.findFirstVisibleTextOffset = function ($element, $textNode, props) {
        /* WTF are the 2 lines below and the final relaceWith() doing below?? */
        var $workingCopy = $element.clone();
        /* use our working copy */
        $element.replaceWith($workingCopy);

        var text = $textNode[0].nodeValue;

        /* remove anything after $textNode in our working copy */
        var textNodeIndex = $element.contents().index($textNode);

        /* add text back one word at a time until $element is once again passing leftOffset */
        var words = text.split(' ');
        var size = words.length;
        var i = 0;
        var textOffset = 0;
        var $currentTextNode = $workingCopy.contents().eq(textNodeIndex);
        if ($workingCopy.contents().length > textNodeIndex + 1) {
            $workingCopy.contents().slice(textNodeIndex + 1).remove();
        }
        var $tempTextNode;
        for (; i < size; i++) {
            var newText = words.slice(0, i + 1).join(' ');
            $tempTextNode = $(document.createTextNode(newText));
            $currentTextNode.replaceWith($tempTextNode);
            $currentTextNode = $tempTextNode;

            var visibilityResult = visibilityCheckerFunc($workingCopy, props, true);
            if (visibilityResult) {
                break;
            }
            textOffset = newText.length;
        }
        while (text.charAt(textOffset) == ' ') textOffset++;

        /* replace our original text */
        $workingCopy.replaceWith($element);

        return textOffset;
    };

    this.findLastVisibleTextOffset = function ($element, $textNode, props) {
        var $workingCopy = $element.clone();
        /* use our working copy */
        $element.replaceWith($workingCopy);

        var text = $textNode[0].nodeValue;

        /* remove anything after $textNode in our working copy */
        var textNodeIndex = $element.contents().index($textNode);

        /* remove text one word at a time until $element is 100% visible */
        var words = text.split(' ');
        var size = words.length;
        var i = size;
        var textOffset = text.length;
        var $currentTextNode = $workingCopy.contents().eq(textNodeIndex);
        if ($workingCopy.contents().length > textNodeIndex + 1) {
            $workingCopy.contents().slice(textNodeIndex + 1).remove();
        }
        var $tempTextNode;
        for (; i >= 0; i--) {
            var newText = words.slice(0, i + 1).join(' ');
            $tempTextNode = $(document.createTextNode(newText));
            $currentTextNode.replaceWith($tempTextNode);
            $currentTextNode = $tempTextNode;

            var visibilityResult = visibilityCheckerFunc($workingCopy, props, true);
            textOffset = newText.length;
            if (visibilityResult == 100) {
                break;
            }
        }
        while (text.charAt(textOffset) == ' ') textOffset++;

        /* replace our original text */
        $workingCopy.replaceWith($element);

        return textOffset;
    };

    this.getFirstVisibleTextOffsetCfi = function (props) {
        var node = this.findFirstVisibleNodeWithTextOffset(props);
        return this.getCfiForNode(node);
    };

    this.getLastVisibleTextOffsetCfi = function (props) {
        var node = this.findLastVisibleNodeWithTextOffset(props);
        return this.getCfiForNode(node);
    };

    this.getCfiForNode = function(node) {
        if (!node.$element || node.$element.size() === 0) {
            console.log("Could not generate CFI. The page has no visible elements.");
            return undefined;
        }

        var cfi;
        if (node.$element[0].nodeType === Node.TEXT_NODE) {
            cfi = EPUBcfi.generateCharacterOffsetCFIComponent(node.$element[0], node.textOffset, ["blacklist"]);
        } else {
            cfi = EPUBcfi.generateElementCFIComponent(node.$element[0], ["blacklist"]);
        }

        if (cfi[0] === "!") {
            cfi = cfi.substring(1);
        }

        return cfi;
    };

    this.getFirstVisibleElementCfi = function (leftOffset) {
        return this.getFirstVisibleTextOffsetCfi(leftOffset);
    };

    this.getLastVisibleElementCfi = function (leftOffset) {
        return this.getLastVisibleTextOffsetCfi(leftOffset);
    };

    this.isElementCfiVisible = function (elementCfi, currentPage) {
        var pageIndex = ReadiumSDK.Views.CfiNavigationLogic.getPageForElementCfi(elementCfi);

        if (currentPage == pageIndex) {
            return true;
        }
        return false;
    };

    this.getBookmark = function (ltr) {
        // respect RTL
        var root = $iframe[0].contentDocument.body || $iframe[0].contentDocument.documentElement;

        // Relative offset to the viewport for the bookmark for: columnGap or screenWidth - columnGap
        var offset = (ltr) ? options.paginationInfo.columnGap : $(root).width() - options.paginationInfo.columnGap;
        return ReadiumSDK.Views.CfiNavigationLogic.getBookmarkForOffset(offset);
    };

    this.getBookmarkForOffset = function (offset) {
        var bookmark = {};
        var cfiData = ReadiumSDK.Views.CfiNavigationLogic.getFirstVisibleTextOffsetCfi(offset);
        if (!cfiData) {
            //Couldn't find anything to create a CFI to, so make it a virtual first element
            return JSON.stringify({ contentCFI: "/0", context: "" });
        }
        bookmark.contentCFI = cfiData.cfi;

        if (cfiData.elementData && cfiData.elementData.$element.get(0).nodeType === Node.ELEMENT_NODE &&
            cfiData.elementData.$element.get(0).nodeName.toLowerCase() === "img") {
            var altAttr = cfiData.elementData.$element.attr("alt");
            if (altAttr) {
                bookmark.context = "[image] " + altAttr.substring(0, 64);
            } else {
                bookmark.context = "[image]";
            }
        } else if (cfiData.elementData) {
            var textData = cfiData.elementData.$element.text();
            var element = cfiData.elementData.$element[0].nextSibling;
            while (element) {
                if (element.nodeType === 3) {
                    textData += element.nodeValue;
                } else {
                    textData += $(element).text();
                }
                element = element.nextSibling;
            }
            bookmark.context = textData.substring(cfiData.elementData.textOffset, cfiData.elementData.textOffset + 64);
        }

        return JSON.stringify(bookmark);
    };

    this.getPageForElementCfi = function (cfi) {

        var contentDoc = $iframe[0].contentDocument;
        var cfiParts = this.splitCfi(cfi);

        var wrappedCfi = "epubcfi(" + cfiParts.cfi + ")";
        $('body', $iframe[0].contentDocument).get(0).normalize();
        var $element = EPUBcfi.getTargetElementWithPartialCFI(wrappedCfi, contentDoc, ["blacklist"]);
        var $removeElement;
        if ($element[0].nodeType === Node.TEXT_NODE) {
            var $injectElement = $("<span>-</span>");
            EPUBcfi.injectElementAtOffset($element, cfiParts.chr, $injectElement);
            $removeElement = $injectElement;
            $element = $injectElement;
        }

        if (!$element || $element.length === 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        var page = this.getPageForElement($element, 1, 1);
        //console.log('page for cfi '+cfi+' (new way) is '+findPageByRectangles($element, 1));
        //console.log('page for cfi '+cfi+' (old way) is '+this.getPageForElement($element, 1, 1));

        if ($removeElement) {
            $removeElement.remove();
        }

        return page;
    };

    function getElementByPartialCfi(cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var contentDoc = $iframe[0].contentDocument;

        var wrappedCfi = "epubcfi(" + cfi + ")";
        //noinspection JSUnresolvedVariable
        var $element = EPUBcfi.getTargetElementWithPartialCFI(wrappedCfi, contentDoc, classBlacklist, elementBlacklist, idBlacklist);

        if(!$element || $element.length === 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        return $element;
    };

    this.getElementByCfi = function(cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var cfiParts = this.splitCfi(cfi);
        return getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);
    };

    // (MDA) After removing unused vars below x,y is no longer used - clean up
    this.getPageForElement = function ($element, x, y) {

        var elementRect = Helpers.Rect.fromElement($element);
        // For some reason Readium can get confused here. jQuery reports the right values
        // (MDA) What is wrong with readium? Why make the call here at all then if it's broken??
        var offset = $element.offset();
        elementRect.left = offset.left;
        elementRect.top = offset.top;

        var $columnDiv = $('html', $iframe[0].contentDocument);
        //var columnWidth = $columnDiv.width() + options.paginationInfo.columnGap;
        var columnHeight = $columnDiv.height();
        var columnWidth = options.paginationInfo.columnWidth;
        var rectHeight = elementRect.top / columnHeight;
        var rectWidth = elementRect.left / columnWidth;
        var column = rectHeight;
        if (elementRect.left > columnWidth) {
            column = rectWidth;
        }
        // Always judge if we are near the next page based on height
        // TODO: This should probably be different for vertical writing mode, though
        var extra = rectHeight % 1;
        column = Math.floor(column);
        //console.log('column: '+column+', extra: '+extra+', elementRect: '+JSON.stringify(elementRect)+
        //', columnWidth: '+(columnWidth + gap)+', columnHeight: '+columnHeight);
        if (extra > 0.9) {
            column++;
        }

        return options.paginationInfo.currentSpreadIndex * options.paginationInfo.visibleColumnCount + column;
    };

    this.getPageForElementId = function (id) {

        var $element = $("#" + id);
        if ($element.length === 0) {
            return -1;
        }

        return this.getPageForElement($element, 0, 0);
    };

    this.splitCfi = function (cfi) {

        var ret = {
            cfi: "",
            chr: 0,
            x: 0,
            y: 0
        };

        var ix = cfi.indexOf("@");
        var chrOffsetIx = cfi.indexOf(":");
        var terminus;
        if (ix != -1) {
            terminus = cfi.substring(ix + 1);

            var colIx = terminus.indexOf(":");
            if (colIx != -1) {
                ret.x = parseInt(terminus.substr(0, colIx));
                ret.y = parseInt(terminus.substr(colIx + 1));
            }
            else {
                console.log("Unexpected terminating step format");
            }

            ret.cfi = cfi.substring(0, ix);
        }
        else if (chrOffsetIx != -1) {
            terminus = cfi.substring(chrOffsetIx + 1);
            ret.chr = parseInt(terminus);

            ret.cfi = cfi.substring(0, chrOffsetIx);
        }
        else {

            ret.cfi = cfi;
        }

        return ret;
    };

};
return CfiNavigationLogic;
});
