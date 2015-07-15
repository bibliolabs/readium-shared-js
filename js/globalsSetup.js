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

//'text!empty:'
define(['console_shim', 'eventEmitter', 'URIjs', 'readium_cfi_js', './globals'], function (console_shim, EventEmitter, URI, epubCfi, Globals) {

    console.log("Globals...");

    if (window["ReadiumSDK"]) {
        console.log("ReadiumSDK extend.");
        _.extend(Globals, window.ReadiumSDK);
    } else {
        console.log("ReadiumSDK set.");
    }
    
        window.ReadiumSDK = Globals;

    // TODO: refactor client code to use emit instead of trigger?
    EventEmitter.prototype.trigger = EventEmitter.prototype.emit;

    // TODO pass as dependency injection define() function parameter, not window global!
    window.EventEmitter = EventEmitter;

    // TODO pass as dependency injection define() function parameter, not window global!
    window.URI = URI;

    // window.URL accessor to window.webkitURL (Safari 6 support)
    if ('URL' in window === false) {
        if ('webkitURL' in window === false) {
            throw Error('Browser does not support window.URL');
        }

        window.URL = window.webkitURL;
    }
});
