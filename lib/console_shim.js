/*
This code is required to IE for console shim
*/
(function(){
    "use strict";
    if (!console["trace"]) console.trace = console.log;
    if (!console["debug"]) console.debug = console.log;
    if (!console["info"]) console.info = console.log;
    if (!console["warn"]) console.warn = console.log;
    if (!console["error"]) console.error = console.log;
})();