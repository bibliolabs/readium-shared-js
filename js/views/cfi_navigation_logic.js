//  LauncherOSX
//
//  Created by Boris Schneiderman.
//  Copyright (c) 2012-2013 The Readium Foundation.
//
//  The Readium SDK is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

/*
 * CFI navigation helper class
 *
 * @param $viewport
 * @param $iframe
 * @constructor
 */

ReadiumSDK.Views.CfiNavigationLogic = function($viewport, $iframe){

    this.$viewport = $viewport;
    this.$iframe = $iframe;

    this.getRootElement = function(){

        return this.$iframe[0].contentDocument.documentElement

    };

    this.isCfiVisible = function(elementCfi, topOffset) {

    }

    //we look for text and images
    this.findFirstVisibleElement = function (topOffset) {

        var $elements;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;

        $elements = $("body", this.getRootElement()).find(":not(iframe)").contents().filter(function () {
            return this.nodeType === Node.TEXT_NODE || this.nodeName.toLowerCase() === 'img';
        });

        // Find the first visible text node
        $.each($elements, function() {

            var $element;

            if(this.nodeType === Node.TEXT_NODE)  { //text node
                // Heuristic to find a text node with actual text
                var nodeText = this.nodeValue.replace(/\n/g, "");
                nodeText = nodeText.replace(/ /g, "");

                if(nodeText.length > 0) {
                    $element = $(this).parent();
                }
                else {
                    return true; //next element
                }
            }
            else {
                $element = $(this); //image
            }

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);

            if (elementRect.bottom() > topOffset) {

                $firstVisibleTextNode = $element;

                if(elementRect.top > topOffset) {
                    percentOfElementHeight = 0;
                }
                else {
                    percentOfElementHeight = Math.ceil(((topOffset - elementRect.top) / elementRect.height) * 100);
                }

                // Break the loop
                return false;
            }

            return true; //next element
        });

        return {$element: $firstVisibleTextNode, percentY: percentOfElementHeight};
    };


    //we look for text and images
    this.findFirstVisibleElementWithTextOffset = function (topOffset) {

        var $elements;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var characterOffset = 0;
        var self = this;

        $elements = $("body", this.getRootElement()).find(":not(iframe)").contents().filter(function () {
            return this.nodeType === Node.TEXT_NODE || this.nodeName.toLowerCase() === 'img';
        });

        // Find the first visible text node
        $.each($elements, function() {

            var $element;

            if(this.nodeType === Node.TEXT_NODE)  { //text node
                // Heuristic to find a text node with actual text
                var nodeText = this.nodeValue.replace(/\n/g, "");
                nodeText = nodeText.replace(/ /g, "");

                if(nodeText.length > 0) {
                    $element = $(this).parent();
                }
                else {
                    return true; //next element
                }
            }
            else {
                $element = $(this); //image
            }

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);

            if (elementRect.bottom() > topOffset) {

                $firstVisibleTextNode = $element;

                if(elementRect.top > topOffset) {
                    characterOffset = 0;
                    percentOfElementHeight = 0;
                }
                else {
                    characterOffset = 0;
                    if(this.nodeType === Node.TEXT_NODE) {
                        //find the character offset that is first visible
                        characterOffset = self.findFirstVisibleTextOffset($element, $(this), topOffset);
                    }
                    percentOfElementHeight = Math.ceil(((topOffset - elementRect.top) / elementRect.height) * 100);
                }

                // Break the loop
                return false;
            }

            return true; //next element
        });

        return {$element: $firstVisibleTextNode, percentY: percentOfElementHeight, textOffset: characterOffset};
    };

    this.findFirstVisibleTextOffset = function($element, $textNode, topOffset) {
        var text = $textNode[0].nodeValue;

        //add text back one word at a time until $element is once again passing topOffset
        var words = text.split(' ');
        var size = words.length;
        var i = 0;
        var textOffset = 0;
        var currentTextNode = $textNode[0];
        var tempTextNode;
        for(;i < size; i++) {
            var newText = words.slice(0, i+1).join(' ');
            tempTextNode = document.createTextNode(newText);
            $element[0].replaceChild(tempTextNode, currentTextNode);
            currentTextNode = tempTextNode;

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);
            if(elementRect.bottom() > topOffset) {
                break;
            }
            textOffset = newText.length;
        }
        if(text.charAt(textOffset) == ' ') textOffset++;

        //replace our original text
        $element[0].replaceChild($textNode[0], currentTextNode);

        return textOffset;
    }

    this.findFirstVisibleTextOffsetCfi = function(topOffset) {
        var foundElement = this.findFirstVisibleElementWithTextOffset(topOffset);

        if(!foundElement.$element) {
            console.log("Could not generate CFI. The page has no visible elements.");
            return undefined;
        }

        var cfi = EPUBcfi.Generator.generateElementCFIComponent(foundElement.$element[0]);

        if(cfi[0] == "!") {
            cfi = cfi.substring(1);
        }

        return { cfi: cfi + "@0:" + foundElement.percentY, elementData: foundElement };
    }

    this.getFirstVisibleElementCfi = function(topOffset) {

        var foundElement = this.findFirstVisibleElement(topOffset);

        if(!foundElement.$element) {
            console.log("Could not generate CFI no visible element on page");
            return undefined;
        }

        var cfi = EPUBcfi.Generator.generateElementCFIComponent(foundElement.$element[0]);

        if(cfi[0] == "!") {
            cfi = cfi.substring(1);
        }

        return cfi + "@0:" + foundElement.percentY;
    };

    this.getPageForElementCfi = function(cfi) {

        var contentDoc = this.$iframe[0].contentDocument;
        var cfiParts = this.splitCfi(cfi);

        var wrappedCfi = "epubcfi(" + cfiParts.cfi + ")";
        var $element = EPUBcfi.Interpreter.getTargetElementWithPartialCFI(wrappedCfi, contentDoc);
        var $removeElement;
        if($element[0].nodeType === Node.TEXT_NODE) { 
            var $injectElement = $("<span/>", {});
            EPUBcfi.CFIInstructions.textTermination($element, cfiParts.chr, $injectElement);
            var $parentElement = $element.parent();
            var parentOffset = $parentElement.offset();

            //Avoid a browser bug where text at the very left or right of the parent element
            //produces an incorrect offset.
            if($injectElement.offset().left == parentOffset.left) {
                $injectElement.remove();
                $element = EPUBcfi.Interpreter.getTargetElementWithPartialCFI(wrappedCfi, contentDoc);
                cfiParts.chr++;
                EPUBcfi.CFIInstructions.textTermination($element, cfiParts.chr, $injectElement);
            }
            else if($injectElement.offset().left == parentOffset.left + $parentElement.width()) {
                $injectElement.remove();
                $element = EPUBcfi.Interpreter.getTargetElementWithPartialCFI(wrappedCfi, contentDoc);
                cfiParts.chr--;
                EPUBcfi.CFIInstructions.textTermination($element, cfiParts.chr, $injectElement);
            }
            $removeElement = $injectElement;
            $element = $injectElement;
        }

        if(!$element || $element.length == 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        var page = this.getPageForElement($element, cfiParts.x, cfiParts.y);
        
        if($removeElement) {
            $removeElement.remove();
        }

        return page;
    };

    this.getPageForElement = function($element, x, y) {

        var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);
        var posInElement = Math.ceil(elementRect.top + y * elementRect.height / 100);

        var column = Math.floor(posInElement / this.$viewport.height());

        return column;
    };

    this.getPageForElementId = function(id) {

        var contentDoc = this.$iframe[0].contentDocument;

        var $element = $("#" + id, contentDoc);
        if($element.length == 0) {
            return -1;
        }

        return this.getPageForElement($element, 0, 0);
    };

    this.splitCfi = function(cfi) {

        var ret = {
            cfi: "",
            chr: 0,
            x: 0,
            y: 0
        };

        var ix = cfi.indexOf("@");
        var chrOffsetIx = cfi.indexOf(":");

        if(ix != -1) {
            var terminus = cfi.substring(ix + 1);

            var colIx = terminus.indexOf(":");
            if(colIx != -1) {
                ret.x = parseInt(terminus.substr(0, colIx));
                ret.y = parseInt(terminus.substr(colIx + 1));
            }
            else {
                console.log("Unexpected terminating step format");
            }

            ret.cfi = cfi.substring(0, ix);
        }
        else if (chrOffsetIx != -1) {
            var terminus = cfi.substring(chrOffsetIx + 1);
            ret.chr = parseInt(terminus);

            ret.cfi = cfi.substring(0, chrOffsetIx);
        }
        else {

            ret.cfi = cfi;
        }

        return ret;
    };

};
