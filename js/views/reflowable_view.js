
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
 * Renders reflowable content using CSS columns
 *
 * @class ReadiumSDK.Views.ReflowableView
 */

ReadiumSDK.Views.ReflowableView = Backbone.View.extend({

    currentSpineItem: undefined,
    isWaitingFrameRender: false,
    deferredPageRequest: undefined,
    spine: undefined,
    fontSize:100,
    currentIframe: 1,

    lastViewPortSize : {
        width: undefined,
        height: undefined
    },

    paginationInfo : {

        visibleColumnCount : 2,
        columnGap : 20,
        spreadCount : 0,
        currentSpreadIndex : 0,
        columnWidth : undefined,
        pageOffset : 0,
        columnCount: 0
    },

    initialize: function() {

        this.spine = this.options.spine;
        this.template = _.template($("#template-reflowable-view").html());
    },

    render: function(){

        this.$el.html(this.template({}));

        this.$viewport = $("#viewport_reflowable", this.$el);
        this.$iframe = $(".epubContentIframe", this.$el);

        this.$iframe.css("left", "");
        this.$iframe.css("right", "");
        this.$iframe.eq(this.currentIframe).css(this.spine.isLeftToRight() ? "left" : "right", "0px");

        //We will call onViewportResize after user stopped resizing window
        var lazyResize = _.debounce(this.onViewportResize, 100);
        $(window).on("resize.ReadiumSDK.reflowableView", _.bind(lazyResize, this));

        return this;
    },

    remove: function() {

        $(window).off("resize.ReadiumSDK.reflowableView");

        //base remove
        Backbone.View.prototype.remove.call(this);
    },

    isReflowable: function() {
        return true;
    },

    onViewportResize: function() {

        if(this.updateViewportSize()) {
            this.updatePagination();
        }

    },

    setViewSettings: function(settings) {

        this.paginationInfo.visibleColumnCount = settings.isSyntheticSpread ? 2 : 1;
        this.paginationInfo.columnGap = settings.columnGap;
        this.fontSize = settings.fontSize;
        this.updateHtmlFontSizeAndColumnGap();

        this.updatePagination();
    },

    registerTriggers: function (doc) {
        $('trigger', doc).each(function() {
            var trigger = new ReadiumSDK.Models.Trigger(this);
            trigger.subscribe(doc);

        });
    },

    loadSpineItem: function(spineItem) {

        if(this.currentSpineItem != spineItem) {

            this.paginationInfo.currentSpreadIndex = 0;
            var forwardDirection = true;
            if(this.currentSpineItem) forwardDirection = (this.currentSpineItem.index < spineItem.index);
            this.currentSpineItem = spineItem;
            this.isWaitingFrameRender = true;

            var src = this.spine.getItemUrl(spineItem);
            var newIframe = this.$iframe.eq((this.currentIframe == 0)?1:0);
            var oldIframe = this.$iframe.eq((this.currentIframe == 0)?0:1);

            //turn off iframe transitions for newIframe to align it for the direction we're moving
            newIframe.css("transition", "");
            newIframe.css("-webkit-transition", "");

            //update the viewport size to be sure we calculate positions on recent data
            this.updateViewportSize();
            var frameWidth = this.lastViewPortSize.width;
            var adjustProperty = this.spine.isLeftToRight() ? "left" : "right";

            //position the iframes in the correct order
            newIframe.css(adjustProperty, (forwardDirection)?frameWidth+"px":"-"+frameWidth+"px");

            ReadiumSDK.Helpers.LoadIframe(newIframe[0], src, this.onIFrameLoad, this);
        }
    },

    updateHtmlFontSizeAndColumnGap: function() {

        if(this.$epubHtml) {
            this.$epubHtml.css("font-size", this.fontSize + "%");
            this.$epubHtml.css("-webkit-column-gap", this.paginationInfo.columnGap + "px");
        }
    },

    onIFrameLoad : function(success) {
        var oldIframe = this.$iframe.eq(this.currentIframe);
        this.currentIframe = (this.currentIframe == 0)?1:0;
        var newIframe = this.$iframe.eq(this.currentIframe);

        var frameWidth = this.lastViewPortSize.width;
        var adjustProperty = this.spine.isLeftToRight() ? "left" : "right";

        this.isWaitingFrameRender = false;

        //while we where loading frame new request came
        if(this.deferredPageRequest && this.deferredPageRequest.spineItem != this.currentSpineItem) {
            this.loadSpineItem(this.deferredPageRequest.spineItem);
            return;
        }

        if(!success) {
            this.deferredPageRequest = undefined;
            return;
        }

        var epubContentDocument = newIframe[0].contentDocument;
        this.$epubHtml = $("html", epubContentDocument);

        this.$epubHtml.css("height", "100%");
        this.$epubHtml.css("position", "absolute");
        this.$epubHtml.css("-webkit-column-axis", "horizontal");

        //Slower browsers / devices need a little extra time loading the document for this
        //transition to complete properly. (Kindle Fire HD)
        setTimeout(function() {
            //reconfigure the transition property for our animation
            newIframe.css("transition", "left 0.25s linear, right 0.25s linear");
            newIframe.css("-webkit-transition", "left 0.25s linear, right 0.25s linear");

            //animate the iframes to simulate the page slide
            var goingForward = (newIframe.position().left > 0)?true:false;
            var viewOffset = oldIframe.parents().position().left * 2;
            oldIframe.css(adjustProperty, (goingForward)?"-"+(frameWidth)+"px":(frameWidth+viewOffset)+"px");
            newIframe.css(adjustProperty, newIframe.parents().offset().left+"px");
        }, 100);

        this.updateHtmlFontSizeAndColumnGap();


/////////
//Columns Debugging
//                    $epubHtml.css("-webkit-column-rule-color", "red");
//                    $epubHtml.css("-webkit-column-rule-style", "dashed");
//                    $epubHtml.css("background-color", '#b0c4de');
/////////

        this.updateViewportSize();
        this.updatePagination();

        this.applySwitches(epubContentDocument);
        this.registerTriggers(epubContentDocument);
    },

    openDeferredElement: function() {

        if(!this.deferredPageRequest) {
            return;
        }

        var deferredData = this.deferredPageRequest;
        this.deferredPageRequest = undefined;
        this.openPage(deferredData);

    },

    openPage: function(pageRequest) {

        if(this.isWaitingFrameRender) {
            this.deferredPageRequest = pageRequest;
            return;
        }

        // if no spine item specified we are talking about current spine item
        if(pageRequest.spineItem && pageRequest.spineItem != this.currentSpineItem) {
            this.deferredPageRequest = pageRequest;
            this.loadSpineItem(pageRequest.spineItem);
            return;
        }

        var pageIndex = undefined;
        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(this.$viewport, this.$iframe.eq(this.currentIframe));

        if(pageRequest.spineItemPageIndex !== undefined) {
            pageIndex = pageRequest.spineItemPageIndex;
        }
        else if(pageRequest.elementId) {
            pageIndex = navigation.getPageForElementId(pageRequest.elementId);
        }
        else if(pageRequest.elementCfi) {
            pageIndex = navigation.getPageForElementCfi(pageRequest.elementCfi);
        }
        else if(pageRequest.firstPage) {
            pageIndex = 0;
        }
        else if(pageRequest.lastPage) {
            pageIndex = this.paginationInfo.columnCount - 1;
        }

        if(pageIndex !== undefined && pageIndex >= 0 && pageIndex < this.paginationInfo.columnCount) {

            this.paginationInfo.currentSpreadIndex = Math.floor(pageIndex / this.paginationInfo.visibleColumnCount) ;
            this.onPaginationChanged();
        }
    },

    isCfiVisible: function(cfi) {
        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(this.$viewport, this.$iframe.eq(this.currentIframe));
        var pageIndex = navigation.getPageForElementCfi(cfi);

        if(this.paginationInfo.currentSpreadIndex == Math.floor(pageIndex / this.paginationInfo.visibleColumnCount)) {
            return true;
        }
        return false;
    },

    redraw: function() {

        var offsetVal =  -this.paginationInfo.pageOffset + "px";

        this.$epubHtml.css("left", this.spine.isLeftToRight() ? offsetVal : "");
        this.$epubHtml.css("right", this.spine.isRightToLeft() ? offsetVal : "");
    },

    updateViewportSize: function() {

        var newWidth = this.$viewport.width();
        var newHeight = this.$viewport.height();

        if(this.lastViewPortSize.width !== newWidth || this.lastViewPortSize.height !== newHeight){

            this.lastViewPortSize.width = newWidth;
            this.lastViewPortSize.height = newHeight;
            return true;
        }

        return false;
    },

    // Description: Parse the epub "switch" tags and hide
    // cases that are not supported
    applySwitches: function(dom) {

        // helper method, returns true if a given case node
        // is supported, false otherwise
        var isSupported = function(caseNode) {

            var ns = caseNode.attributes["required-namespace"];
            if(!ns) {
                // the namespace was not specified, that should
                // never happen, we don't support it then
                console.log("Encountered a case statement with no required-namespace");
                return false;
            }
            // all the xmlns that readium is known to support
            // TODO this is going to require maintenance
            var supportedNamespaces = ["http://www.w3.org/1998/Math/MathML"];
            return _.include(supportedNamespaces, ns);
        };

        $('switch', dom).each( function() {

            // keep track of whether or now we found one
            var found = false;

            $('case', this).each(function() {

                if( !found && isSupported(this) ) {
                    found = true; // we found the node, don't remove it
                }
                else {
                    $(this).remove(); // remove the node from the dom
//                    $(this).prop("hidden", true);
                }
            });

            if(found) {
                // if we found a supported case, remove the default
                $('default', this).remove();
//                $('default', this).prop("hidden", true);
            }
        })
    },

    onPaginationChanged: function() {

        this.paginationInfo.pageOffset = (this.paginationInfo.columnWidth + this.paginationInfo.columnGap) * this.paginationInfo.visibleColumnCount * this.paginationInfo.currentSpreadIndex;
        this.redraw();
        this.trigger("ViewPaginationChanged");
    },

    openPagePrev:  function () {

        if(!this.currentSpineItem) {
            return;
        }

        if(this.paginationInfo.currentSpreadIndex > 0) {
            this.paginationInfo.currentSpreadIndex--;
            this.onPaginationChanged();
        }
        else {

            var prevSpineItem = this.spine.prevItem(this.currentSpineItem);
            if(prevSpineItem) {

                var pageRequest = new ReadiumSDK.Models.PageOpenRequest(prevSpineItem);
                pageRequest.setLastPage();
                this.openPage(pageRequest);
            }
        }
    },

    openPageNext: function () {

        if(!this.currentSpineItem) {
            return;
        }

        if(this.paginationInfo.currentSpreadIndex < this.paginationInfo.spreadCount - 1) {
            this.paginationInfo.currentSpreadIndex++;
            this.onPaginationChanged();
        }
        else {

            var nextSpineItem = this.spine.nextItem(this.currentSpineItem);
            if(nextSpineItem) {

                var pageRequest = new ReadiumSDK.Models.PageOpenRequest(nextSpineItem);
                pageRequest.setFirstPage();
                this.openPage(pageRequest);
            }
        }
    },

    updatePagination: function() {

        if(!this.$epubHtml) {
            return;
        }

        this.$iframe.css("width", this.lastViewPortSize.width + "px");
        this.$iframe.css("height", this.lastViewPortSize.height + "px");

        this.$epubHtml.css("height", this.lastViewPortSize.height + "px");

        this.paginationInfo.columnWidth = (this.lastViewPortSize.width - this.paginationInfo.columnGap * (this.paginationInfo.visibleColumnCount - 1)) / this.paginationInfo.visibleColumnCount;

        //we do this because CSS will floor column with by itself if it is not a round number
        this.paginationInfo.columnWidth = Math.floor(this.paginationInfo.columnWidth);

        this.$epubHtml.css("width", this.paginationInfo.columnWidth + "px");

        this.shiftBookOfScreen();

        this.$epubHtml.css("-webkit-column-width", this.paginationInfo.columnWidth + "px");

        var self = this;
        //TODO it takes time for rendition_layout engine to arrange columns we waite
        //it would be better to react on rendition_layout column reflow finished event
        setTimeout(function(){

            var columnizedContentWidth = self.$epubHtml[0].scrollWidth;

            self.paginationInfo.columnCount = Math.round((columnizedContentWidth + self.paginationInfo.columnGap) / (self.paginationInfo.columnWidth + self.paginationInfo.columnGap));

            self.paginationInfo.spreadCount =  Math.ceil(self.paginationInfo.columnCount / self.paginationInfo.visibleColumnCount);

            if(self.paginationInfo.currentSpreadIndex >= self.paginationInfo.spreadCount) {
                self.paginationInfo.currentSpreadIndex = self.paginationInfo.spreadCount - 1;
            }

            self.openDeferredElement();

            //We do this to force re-rendering of the document in the iframe.
            //There is a bug in WebView control with right to left columns layout - after resizing the window html document
            //is shifted in side the containing div. Hiding and showing the html element puts document in place.
            self.$epubHtml.css("transition", "");
            self.$epubHtml.css("-webkit-transition", "");
            self.$epubHtml.hide();
            setTimeout(function() {
                self.$epubHtml.show();
                self.onPaginationChanged();
                self.$epubHtml.css("transition", "left 0.25s linear, right 0.25s linear");
                self.$epubHtml.css("-webkit-transition", "left 0.25s linear, right 0.25s linear");
            }, 50);

        }, 100);

    },

    shiftBookOfScreen: function() {

        if(this.spine.isLeftToRight()) {
            this.$epubHtml.css("left", (this.lastViewPortSize.width + 1000) + "px");
        }
        else {
            this.$epubHtml.css("right", (this.lastViewPortSize.width + 1000) + "px");
        }
    },

    getFirstVisibleElementCfi: function(){

        var columnsLeftOfViewport = Math.round(this.paginationInfo.pageOffset / (this.paginationInfo.columnWidth + this.paginationInfo.columnGap));
        var topOffset = columnsLeftOfViewport * this.$viewport.height();

        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(this.$viewport, this.$iframe.eq(this.currentIframe));
        return navigation.getFirstVisibleElementCfi(topOffset);
    },

    getPaginationInfo: function() {

        var paginationInfo = new ReadiumSDK.Models.CurrentPagesInfo(this.spine.items.length, this.spine.package.isFixedLayout(), this.spine.direction);

        if(!this.currentSpineItem) {
            return paginationInfo;
        }

        var currentPage = this.paginationInfo.currentSpreadIndex * this.paginationInfo.visibleColumnCount;

        for(var i = 0; i < this.paginationInfo.visibleColumnCount && (currentPage + i) < this.paginationInfo.columnCount; i++) {

            paginationInfo.addOpenPage(currentPage + i, this.paginationInfo.columnCount, this.currentSpineItem.idref, this.currentSpineItem.index);
        }

        return paginationInfo;

    },

    bookmarkCurrentPage: function() {

        if(!this.currentSpineItem) {

            return new ReadiumSDK.Models.BookmarkData("", "");
        }

        return new ReadiumSDK.Models.BookmarkData(this.currentSpineItem.idref, this.getFirstVisibleElementCfi());
    },

    bookmarkCurrentPageWithContext: function() {
        var columnsLeftOfViewport = Math.round(this.paginationInfo.pageOffset / (this.paginationInfo.columnWidth + this.paginationInfo.columnGap));
        var topOffset = columnsLeftOfViewport * this.$viewport.height();

        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(this.$viewport, this.$iframe.eq(this.currentIframe));
        cfiData = navigation.findFirstVisibleTextOffsetCfi(topOffset);

        var bookmark = new ReadiumSDK.Models.BookmarkData(this.currentSpineItem.idref, cfiData.cfi);

        if(cfiData.elementData.$element.get(0).nodeType === Node.ELEMENT_NODE &&
        cfiData.elementData.$element.get(0).nodeName.toLowerCase() === "img") {
            var altAttr = cfiData.elementData.$element.attr("alt");
            if(altAttr) {
                bookmark.context = "[image] "+altAttr.substring(0, 64);
            } else {
                bookmark.context = "[image]";
            }
        } else {
            bookmark.context = cfiData.elementData.$element.text().substring(cfiData.elementData.textOffset, cfiData.elementData.textOffset+64);
        }

        return bookmark;
    },

    setFontSize: function(newSize){
        this.fontSize = newSize;
        this.updateHtmlFontSizeAndColumnGap();
//        this.updatePagination();
    },

    getIframe: function() {
        return this.$iframe.eq(this.currentIframe);
    }
});
