(function () {
    "use strict";
    var fs     = require("fs"),
        page   = require("webpage").create(),
        path   = "output/",
        indent = "  ";

    page.settings.localToRemoteUrlAccessEnabled = true;
    page.settings.ignoreSslErrors = true;
    
    phantom.onError = function(msg, trace) {
        var msgStack = ['PHANTOM ERROR: ' + msg];
        if (trace) {
            msgStack.push('TRACE:');
            trace.forEach(function(t) {
                msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line);
            });
        }
        console.log(msgStack.join('\n'));
        
        // exit phantom on error
        phantom.exit();
    };
    
    page.onConsoleMessage = function (msg) {
        fs.makeTree(path);
        console.log(msg)
        console.log("Console Message")
        fs.write(path + "defaults.js", msg, "w");
    };

    page.includeJs("http://ajax.googleapis.com/ajax/libs/jquery/1.8.2/jquery.min.js", function () {
        page.evaluateAsync(function () {
//            console.log($)
//            console.log($.ajax)
            var formatters = {
                'xsd:string'      : function (attr) {return '"'  + attr + '"'; },
                'xsd:integer'     : function (attr) {return attr; },
                'RGBColor'        : function (attr) {return 'function () {return new window.multigraph.math.RGBColor.parse("' + attr + '"); }'; },
                'Boolean'         : function (attr) {return '"'  + attr + '"'; },
                'DPoint'          : function (attr) {return 'function () { return new window.multigraph.math.Point(' + attr.replace(' ', ',') + '); }'; },
                'Frame'           : function (attr) {return '"'  + attr + '"'; },
                'xsd:double'      : function (attr) {return attr; },
                'DataType'        : function (attr) {return '"'  + attr + '"'; },
                'Displacement'    : function (attr) {return 'function () {return new window.multigraph.math.Displacement(' + attr + '); }'; },
                'DPointOrNumber'  : function (attr) {return 'function () {return new window.multigraph.math.Point(' + attr.replace(' ', ',') + '); }'; },
                'DataOrAutoValue' : function (attr) {return '"'  + attr + '"'; },
                'DataValue'       : function (attr) {return '"'  + attr + '"'; },
                'RendererType'    : function (attr) {return 'function () {window.multigraph.core.Renderer.Type.parse("' + attr + '"); }'; },
                'Comparator'      : function (attr) {return '"'  + attr + '"'; },
                'Insets'          : function (attr) {
                    if (typeof attr !== 'object') {
                        return 'function () {return new window.multigraph.math.Insets(/*top*/' + attr + ', /*left*/' + attr + ', /*bottom*/' + attr + ', /*right*/' + attr + '); }';
                    } else {
                        return 'function () {return new window.multigraph.math.Insets(/*top*/' + attr.values.top + ', /*left*/' + attr.values.left + ', /*bottom*/' + attr.values.bottom + ', /*right*/' + attr.values.right + '); }';
                    }
                }
            };

            function handleXML(xmlstring) {
                console.log("1")
                var xmldoc = $.parseXML(xmlstring);
                console.log(processComplexType(xmldoc, $(xmldoc).find('group[name=GraphContent]'), 'foo'));
            } //end handleXML

            function processComplexType(xmldoc, obj, name, prefix) {
                var output = [],
                    partialObjects = {},
                    attrDefault,
                    attrName,
                    attrType,
                    $jstype,
                    jstypePartial,
                    jstypeType,
                    jstypeName,
                    jstypeValue;

                if (prefix === undefined) {
                    prefix = "";
                }

                //for each object with specified name, find the attribute
                obj.find('attribute').each(function () {
                    attrDefault = $(this).attr('default');
                    
                    if ((attrDefault !== undefined) && (attrDefault !== 'unknown')) {
                        $jstype = $(this).find('jstype');
                        attrName = $(this).attr('name');
                        attrType = $(this).attr('type');

                        //check if jstype annotation
                        if ($jstype !== undefined && $jstype.length > 0) {
                            jstypePartial = $jstype.attr('partial');
                            jstypeType = $jstype.attr('type');
                            jstypeName = $jstype.attr('name');
                            jstypeValue = $jstype.attr('value');

                            //check if partial
                            if (jstypePartial === 'true') {
                                if (partialObjects[jstypeName] === undefined) {
                                    partialObjects[jstypeName] = {'type': [jstypeType], 'values': {}};
                                }
                                //save to partial objects
                                partialObjects[jstypeName]['values'][jstypeValue] = attrDefault;
                            } else {
                                //if jstype but not partial, save new jstype attrType for special formatting rules
                                attrType = jstypeType;
                                try {
                                    output.push(indent + prefix + '"' + attrName + '" : ' + formatters[attrType](attrDefault));
                                } catch (e) {
                                    console.log("ERROR: " + e + "\nattribute name = " + attrName + " attribute type = " + attrType + " attribute default " + attrDefault);
                                }
                            }
                        } else {
                            try {
                                output.push(indent + prefix + '"' + attrName + '" : ' + formatters[attrType](attrDefault));
                            } catch (err) {
                                console.log("ERROR: " + err + "\nattribute name = " + attrName + " attribute type = " + attrType + " attribute default " + attrDefault);
                            }
                        }
                    }
                });

                //find each element and process it (for the attribute name, type, and default)
                obj.find('element').each(function () {
                    var subObj,
                        subObjOutput;
                    try {
                        //if found, save subObj
                        subObj = $(xmldoc).find('complexType[name=' + $(this).attr('type') + ']');
                    } catch (e) {
                        //else do nothing
                    }
                    if (subObj !== undefined) {
                        //process subObj for attribute name, type, and default
                        subObjOutput = processComplexType(xmldoc, subObj, $(this).attr('name'), indent + prefix);
                        //test for blank string (instead of null value)
                        if (subObjOutput !== "") {
                            output.push(subObjOutput);
                        }
                    }
                });

                //adds partial objects to output
                $.each(partialObjects, function (name, obj) {
                    output.push(indent + prefix + '"' + name + '" : ' + formatters[obj.type](obj, obj.values));
                });

                //generate results if output array is not empty
                if (output.length > 0) {
                    return prefix + '"' +  name + '"' + " : {\n" + output.join(",\n") + "\n" + prefix + "}";
                } else {
                    return "";
                }
            }//end process complex type

            $.ajax({
                url      : 'test/mugl.xsd',
                dataType : 'text',
                success  : function (xmlstring) {
                    console.log("2")
                    handleXML(xmlstring);
                },
                error : function (jqXHR, textStatus, errorThrown) {
                    console.log("error")
                    console.log(textStatus)
                    console.log(errorThrown)
                }
            });

        });

    });

    window.setTimeout(function () {
        phantom.exit();
    }, 5000);

}());
