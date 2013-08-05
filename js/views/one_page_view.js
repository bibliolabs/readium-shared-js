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
 * Renders one page of fixed layout spread
 * @class ReadiumSDK.Views.OnePageView
 */

//Representation of one fixed page
ReadiumSDK.Views.OnePageView = Backbone.View.extend({

    currentSpineItem: undefined,
    spine: undefined,
    currentIframe: 1,

    meta_size : {
        width: 0,
        height: 0
    },


    initialize: function() {

        this.spine = this.options.spine;

    },

    isDisplaying:function() {

        return this.currentSpineItem != undefined;
    },

    render: function() {

        if(!this.$iframe) {

            this.template = _.template($("#template-ope-fixed-page-view").html(), {});
            this.setElement(this.template);
            this.$el.addClass(this.options.class);
            //this.$iframe = $("iframe", this.$el);

            this.$iframe = $(".fixed_iframe", this.$el);

            this.$iframe.css("left", "");
            this.$iframe.css("right", "");
            this.$iframe.eq(this.currentIframe).css(this.spine.isLeftToRight() ? "left" : "right", "0px");
        }

        return this;
    },

    remove: function() {

        this.currentSpineItem = undefined;

        //base remove
        Backbone.View.prototype.remove.call(this);
    },

    onIFrameLoad:  function(success) {

        if(success) {
            var oldIframe = this.$iframe.eq(this.currentIframe);
            this.currentIframe = (this.currentIframe == 0)?1:0;
            var newIframe = this.$iframe.eq(this.currentIframe);

            var frameWidth = $(viewport_fixed).width();
console.log('got viewport width as '+frameWidth);
            var adjustProperty = this.spine.isLeftToRight() ? "left" : "right";

            var epubContentDocument = newIframe[0].contentDocument;
            this.$epubHtml = $("html", epubContentDocument);
            this.$epubHtml.css("overflow", "hidden");
            this.$epubHtml.css("position", "absolute");
            this.fitToScreen();

            //Slower browsers / devices need a little extra time loading the document for this
            //transition to complete properly. (Kindle Fire HD)
            setTimeout(function() {
                //reconfigure the transition property for our animation
                newIframe.css("transition", "left 0.25s linear, right 0.25s linear");
                newIframe.css("-webkit-transition", "left 0.25s linear, right 0.25s linear");

                //animate the iframes to simulate the page slide
                var goingForward = (newIframe.position().left >= 0)?true:false;
                var viewOffset = oldIframe.parents().position().left * 2;
                console.log('goingForward: '+((goingForward)?"true":"false")+', newIframe.position().left: '+newIframe.position().left);
                oldIframe.css(adjustProperty, (goingForward)?"-"+(frameWidth)+"px":(frameWidth+viewOffset)+"px");
                newIframe.css(adjustProperty, newIframe.parents().offset().left+"px");
            }, 100);
        }

        this.trigger("PageLoaded");
    },

    fitToScreen: function() {

        if(!this.isDisplaying()) {
            return;
        }

        this.updateMetaSize();

        if(this.meta_size.width <= 0 || this.meta_size.height <= 0) {
            return;
        }


        var containerWidth = this.$el.width();
        var containerHeight = this.$el.height();

        var horScale = containerWidth / this.meta_size.width;
        var verScale = containerHeight / this.meta_size.height;

        var scale = Math.min(horScale, verScale);

        var newWidth = this.meta_size.width * scale;
        var newHeight = this.meta_size.height * scale;

        var left = Math.floor((containerWidth - newWidth) / 2);
        var top = Math.floor((containerHeight - newHeight) / 2);

        var css = this.generateTransformCSS(left, top, scale);
        css["width"] = this.meta_size.width;
        css["height"] = this.meta_size.height;

        this.$epubHtml.css(css);
    },

    generateTransformCSS: function(left, top, scale) {

        var transformString = "translate(" + left + "px, " + top + "px) scale(" + scale + ")";

        //modernizer library can be used to get browser independent transform attributes names (implemented in readium-web fixed_layout_book_zoomer.js)
        var css = {};
        css["-webkit-transform"] = transformString;
        css["-webkit-transform-origin"] = "0 0";

        return css;
    },

    updateMetaSize: function() {

        var contentDocument = this.$iframe.eq(this.currentIframe)[0].contentDocument;

        // first try to read viewport size
        var content = $('meta[name=viewport]', contentDocument).attr("content");

        // if not found try viewbox (used for SVG)
        if(!content) {
            content = $('meta[name=viewbox]', contentDocument).attr("content");
        }

        if(content) {
            var size = this.parseSize(content);
            if(size) {
                this.meta_size.width = size.width;
                this.meta_size.height = size.height;
            }
        }
        else { //try to get direct image size

            var $img = $(contentDocument).find('img');
            var width = $img.width();
            var height = $img.height();

            if( width > 0) {
                this.meta_size.width = width;
                this.meta_size.height = height;
            }
        }

    },

    loadSpineItem: function(spineItem) {

        if(this.currentSpineItem != spineItem) {

            var forwardDirection = true;
            if(this.currentSpineItem) forwardDirection = (this.currentSpineItem.index < spineItem.index);

            this.currentSpineItem = spineItem;
            var src = this.spine.getItemUrl(spineItem);

            var newIframe = this.$iframe.eq((this.currentIframe == 0)?1:0);
            var oldIframe = this.$iframe.eq((this.currentIframe == 0)?0:1);

            //turn off iframe transitions for newIframe to align it for the direction we're moving
            newIframe.css("transition", "");
            newIframe.css("-webkit-transition", "");

            //update the viewport size to be sure we calculate positions on recent data
            this.updateMetaSize();
            var frameWidth = $(viewport_fixed).width();
console.log('got viewport width as '+frameWidth);
            var adjustProperty = this.spine.isLeftToRight() ? "left" : "right";
            console.log('forwardDirection: '+((forwardDirection)?"true":"false"));

            //position the iframes in the correct order
            newIframe.css(adjustProperty, (forwardDirection)?frameWidth+"px":"-"+frameWidth+"px");

            ReadiumSDK.Helpers.LoadIframe(newIframe[0], src, this.onIFrameLoad, this);
        }
    },

    parseSize: function(content) {

        var pairs = content.replace(/\s/g, '').split(",");

        var dict = {};

        for(var i = 0;  i  < pairs.length; i++) {
            var nameVal = pairs[i].split("=");
            if(nameVal.length == 2) {

                dict[nameVal[0]] = nameVal[1];
            }
        }

        var width = Number.NaN;
        var height = Number.NaN;

        if(dict["width"]) {
            width = parseInt(dict["width"]);
        }

        if(dict["height"]) {
            height = parseInt(dict["height"]);
        }

        if(!isNaN(width) && !isNaN(height)) {
            return { width: width, height: height} ;
        }

        return undefined;
    },

    getFirstVisibleElementCfi: function(){

        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(this.$el, this.$iframe.eq(this.currentIframe));
        return navigation.getFirstVisibleElementCfi(0);

    }

});
