(function(){
    var NS_SVG = "http://www.w3.org/2000/svg",
        NS_XLINK = "http://www.w3.org/1999/xlink",
        NS_XHTML = "http://www.w3.org/1999/xhtml",
        b = Gordon.buttonStates,
        buttonStates = {},
        buttonMask = 0;
    for(var state in b){ buttonStates[b[state]] = state.toLowerCase(); }
    
    Gordon.SvgRenderer = function(width, height, frmSize, quality, scale, bgcolor){
        var t = this,
            n = t.node = t._createElement("svg"),
            frmLeft = frmSize.left,
            frmTop = frmSize.top,
            attrs = {
                width: width,
                height: height,
                viewBox: '' + [frmLeft, frmTop, frmSize.right - frmLeft, frmSize.bottom - frmTop]
            };
        t.width = width;
        t.height = height;
        t.frmSize = frmSize;
        t.quality = quality || Gordon.qualityValues.HIGH;
        t.scale = scale || Gordon.scaleValues.SHOW_ALL;
        t.bgcolor = bgcolor;
        if(scale == Gordon.scaleValues.EXACT_FIT){ attrs.preserveAspectRatio = "none"; }
        t._setAttributes(n, attrs);
        t._defs = n.appendChild(t._createElement("defs"));
        var s = t._stage = n.appendChild(t._createElement('g'));
        t._setAttributes(s, {
            "fill-rule": "evenodd",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
        });
        t.setQuality(t.quality);
        if(bgcolor){ t.setBgcolor(bgcolor); }
        t._dictionary = {};
        t._fills = {};
        t._set = {};
        t._timeline = [];
        t._displayList = {};
        t._eventTarget = null;
    };
    Gordon.SvgRenderer.prototype = {
        _createElement: function(name){
            return doc.createElementNS(NS_SVG, name);
        },
        
        _setAttributes: function(node, attrs, ns){
            if(node){
                for(var name in attrs){
                    if(ns){ node.setAttributeNS(ns, name, attrs[name]); }
                    else{ node.setAttribute(name, attrs[name]); }
                }
            }
            return node;
        },
        
        setQuality: function(quality){
            var q = Gordon.qualityValues,
                t = this;
            switch(quality){
                case q.LOW:
                    var attrs = {
                        "shape-rendering": "crispEdges",
                        "image-rendering": "optimizeSpeed",
                        "text-rendering": "optimizeSpeed",
                        "color-rendering": "optimizeSpeed"
                    }
                    break;
                case q.AUTO_LOW:
                case q.AUTO_HIGH:
                    var attrs = {
                        "shape-rendering": "auto",
                        "image-rendering": "auto",
                        "text-rendering": "auto",
                        "color-rendering": "auto"
                    }
                    break;
                case q.MEDIUM:
                    var attrs = {
                        "shape-rendering": "optimizeSpeed",
                        "image-rendering": "optimizeSpeed",
                        "text-rendering": "optimizeLegibility",
                        "color-rendering": "optimizeSpeed"
                    }
                    break;
                case q.HIGH:
                    var attrs = {
                        "shape-rendering": "geometricPrecision",
                        "image-rendering": "auto",
                        "text-rendering": "geometricPrecision",
                        "color-rendering": "optimizeQuality"
                    }
                    break;
                case q.BEST:
                    var attrs = {
                        "shape-rendering": "geometricPrecision",
                        "image-rendering": "optimizeQuality",
                        "text-rendering": "geometricPrecision",
                        "color-rendering": "optimizeQuality"
                    }
                    break;
            }
            t._setAttributes(t._stage, attrs);
            t.quality = quality;
            return t;
        },
        
        setBgcolor: function(rgb){
            var t = this;
            if(!t.bgcolor){
                t.node.style.background = color2string(rgb);
                t.bgcolor = rgb;
            }
            return t;
        },
        
        define: function(obj){
            var t = this,
                d = t._dictionary,
                id = obj.id,
                item = d[id],
                type = obj.type,
                node = null,
                attrs = {id: type[0] + id};
            if(!item || !item.node){
                switch(type){
                    case "shape":
                        var segments = obj.segments,
                            fill = obj.fill;
                        if(segments){
                            node = t._createElement('g');
                            var frag = doc.createDocumentFragment();
                            for(var i = 0, seg = segments[0]; seg; seg = segments[++i]){
                                var segNode = frag.appendChild(t._createElement("path"));
                                t._setAttributes(segNode, {id: 's' + seg.id, d: seg.commands});
                            }
                            node.appendChild(frag);
                        }else{
                            if(fill && "pattern" == fill.type && !fill.repeat){
                                node = t._createElement("use");
                                t._setAttributes(node, {href: "#i" + fill.image.id}, NS_XLINK);
                                attrs.transform = matrix2string(fill.matrix);
                            }else{
                                node = t._createElement("path");
                                attrs.d = obj.commands;
                            }
                        }
                        break;
                    case "image":
                        node = t._createElement("image");
                        var colorData = obj.colorData,
                            width = obj.width,
                            height = obj.height,
                            uri = null;
						if(colorData){
							var colorTableSize = obj.colorTableSize || 0,
								withAlpha = obj.withAlpha,
								bpp = ((withAlpha || (obj.format == 5)) ? 4 : 3),
								cmIdx = colorTableSize * bpp,
								pxIdx = 0,
                                canvas = doc.createElement("canvas"),
								ctx = canvas.getContext("2d"),
								imgData = ctx.createImageData(width, height),
								pad = colorTableSize ? ((width + 3) & ~3) - width : 0;
				
							canvas.width = width;
							canvas.height = height;
				
							// If colorTableSize, then image is Colormapped
							// If no colorTableSize, then image is Direct
				
							// Without Alpha
							// (BitmapFormat 3) Colormapped Images are stored RGB, canvas uses RGBA
							// (BitmapFormat 4) Direct Images 15bit are UB[1] res, UB[5] red, UB[5] green, UB[5] blue
							// (BitmapFormat 5) Direct Images 24bit are UI8 res, UI8 red, UI8 green, UI8 blue
				
							// With Alpha
							// (BitmapFormat 3) Colormapped Images are stored RGBA, canvas uses RGBA
							// (BitmapFormat 5) Direct Images 32bit are stored ARGB, canvas uses RGBA
							if(obj.format == 4) colorData = new Flashbug.BytearrayString(colorData.join(''));
				
							for (var y = 0; y < height; y++) {
								for (var x = 0; x < width; x++) {
									var idx = (colorTableSize ? colorData[cmIdx++] : cmIdx++) * bpp, r, g, b, a;
									if(withAlpha) {
										r = colorTableSize ? colorData[idx] : colorData[idx + 1];
										g = colorTableSize ? colorData[idx + 1] : colorData[idx + 2];
										b = colorTableSize ? colorData[idx + 2] : colorData[idx + 3];
										a = colorTableSize ? colorData[idx + 3] : colorData[idx];
									} else {
										if(obj.format == 3) {
											r = colorData[idx];
											g = colorData[idx + 1];
											b = colorData[idx + 2];
										} else if(obj.format == 4) {
											// Untested
											colorData.readUB(1); // Reserved
											r = colorData.readUB(5);
											g = colorData.readUB(5);
											b = colorData.readUB(5);
										} else if(obj.format == 5) {
											//colorData[idx]; // Reserved
											r = colorData[idx + 1];
											g = colorData[idx + 2];
											b = colorData[idx + 3];
										}
										a = 255;
									}
				
									// BUG: Corrupted color data? (zlib?)
									// had an image that wasn't the correct data size
									// colorData.length = 65529
									// imgData.data.length = 65536
									// delta 7px
									if(a) {
										imgData.data[pxIdx] = r || 0; //R
										imgData.data[pxIdx + 1] = g || 0; //G
										imgData.data[pxIdx + 2] = b || 0; //B
										imgData.data[pxIdx + 3] = a; //A
									}
									pxIdx += 4;
								}
								cmIdx += pad;
							}
				
							ctx.putImageData(imgData, 0, 0);
							uri = canvas.toDataURL();
						} else {
							uri = "data:image/jpeg;base64," + btoa(obj.data);
				
							// Moved to the image onload becuase of drawImage blowing up in Firefox
							if (obj.alphaData) {
								var img = new Image(),
									canvas = doc.createElement("canvas"),
									ctx = canvas.getContext("2d"),
									len = width * height,
									data = obj.alphaData;
								img.src = uri;
								canvas.width = width;
								canvas.height = height;
				
								//Component returned failure code: 0x80040111 (NS_ERROR_NOT_AVAILABLE) [nsIDOMCanvasRenderingContext2D.drawImage]
								ctx.drawImage(img, 0, 0); // <----- 
				
								var imgData = ctx.getImageData(0, 0, width, height),
									pxIdx = 0;
				
								for (var i = 0; i < len; i++) {
									imgData.data[pxIdx + 3] = data[i];
									pxIdx += 4;
								}
								ctx.putImageData(imgData, 0, 0);
								uri = canvas.toDataURL();
							}
						}
                        t._setAttributes(node, {href: uri}, NS_XLINK);
                        attrs.width = width;
                        attrs.height = height;
                        break;
                    case "font":
                        var info = obj.info;
                        if(info){
                            node = t._createElement("font");
                            var faceNode = node.appendChild(t._createElement("font-face")),
                                advanceTable = info.advanceTable
                                glyphs = obj.glyphs,
                                codes = info.codes,
                                frag = doc.createDocumentFragment(),
                                kerningTable = info.kerningTable;
                            t._setAttributes(faceNode, {
                                "font-family": id,
                                "units-per-em": 20480,
                                ascent: info.ascent || 20480,
                                descent: info.ascent || 20480,
                                "horiz-adv-x": advanceTable ? '' + advanceTable : 20480
                            });
                            for(var i = 0, glyph = glyphs[0]; glyph; glyph = glyphs[++i]){
                                var cmds = glyph.commands,
                                    code = codes[i];
                                if(cmds && code){
                                    var glyphNode = frag.appendChild(t._createElement("glyph"));
                                    t._setAttributes(glyphNode, {
                                        unicode: fromCharCode(code),
                                        d: glyph.commands
                                    });
                                }
                            }
                            if(kerningTable){
                                for(var i = 0, kern = kerningTable[0]; kern; kern = kerningTable[++i]){
                                    var kernNode = frag.appendChild(t._createElement("hkern"));
                                    t._setAttributes(kernNode, {
                                        g1: kern.code1,
                                        g2: kern.code2,
                                        k: kern.adjustment
                                    });
                                }
                            }
                            node.appendChild(frag);
                        }
                        break;
                    case "text":
                        var frag = doc.createDocumentFragment(),
                            strings = obj.strings;
                        for(var i = 0, string = strings[0]; string; string = strings[++i]){
                            var txtNode = frag.appendChild(t._createElement("text")),
                                entries = string.entries,
                                font = t._dictionary[string.font].object,
                                info = font.info,
                                codes = info.codes,
                                advances = [],
                                chars = [];
                                x = string.x,
                                y = string.y;
                            for(var j = 0, entry = entries[0]; entry; entry = entries[++j]){
                                var str = fromCharCode(codes[entry.index]);
                                if(' ' != str || chars.length){
                                    advances.push(x);
                                    chars.push(str);
                                }
                                x += entry.advance;
                            }
                            t._setAttributes(txtNode, {
                                id: 't' + id + '_' + (i + 1),
                                "font-family": font.id,
                                "font-size": string.size,
                                x: advances.join(' '),
                                y: y
                            });
                            txtNode.appendChild(doc.createTextNode(chars.join('')));
                        }
                        if(strings.length > 1){
                            node = t._createElement('g');
                            node.appendChild(frag);
                        }else{ node = frag.firstChild; }
                        attrs.transform = matrix2string(obj.matrix);
                        break;
                }
                if(node){
                    t._setAttributes(node, attrs);
                    t._defs.appendChild(node);
                }
                d[id] = {
                    object: obj,
                    node: node
                }
            }else{ d[id].object = obj; }
            return t;
        },
        
        frame: function(frm){
            var bgcolor = frm.bgcolor,
                t = this,
                d = frm.displayList;
            if(bgcolor && !t.bgcolor){
                t.setBgcolor(bgcolor);
                t.bgcolor = bgcolor;
            }
            for(depth in d){
                var character = d[depth];
                if(character){ t._cast(character); }
            }
            t._timeline.push(frm);
            return t;
        },
        
        _cast: function(character, cxform2){
            var t = this,
                objId = character.object || t._displayList[character.depth].character.object;
            if(objId){
                if(character.clipDepth){
                    var cpNode = t._defs.appendChild(t._createElement("clipPath")),
                        useNode = cpNode.appendChild(t._createElement("use")),
                        attrs = {id: 'p' + objId},
                        matrix = character.matrix;
                    t._setAttributes(useNode, {href: '#s' + objId}, NS_XLINK);
                    if(matrix){ attrs.transform = matrix2string(matrix); }
                    t._setAttributes(useNode, attrs);
                }
                var cxform1 = character.cxform,
                    cxform = cxform1 && cxform2 ? concatCxform(cxform1, cxform2) : cxform1 || cxform2,
                    characterId = character._id = objectId({
                        object: objId,
                        cxform: cxform
                    });
                if(!t._set[characterId]){
                    var obj = t._dictionary[objId].object,
                        node = null,
                        type = obj.type,
                        t = this,
                        attrs = {id: 'c' + characterId};
                    switch(type){
                        case "shape":
                            var segments = obj.segments;
                            if(segments){
                                node = t._createElement('g');
                                var frag = doc.createDocumentFragment();
                                for(var i = 0, seg = segments[0]; seg; seg = segments[++i]){
                                    var useNode = frag.appendChild(t._createElement("use"));
                                    t._setAttributes(useNode, {href: '#s'+ objId +'_'+ (i + 1)}, NS_XLINK);
                                    t._setStyle(useNode, seg.fill, seg.line, cxform);
                                }
                                node.appendChild(frag);
                            }else{
                                node = t._createElement("use");
                                t._setAttributes(node, {href: '#s' + objId}, NS_XLINK);
                                t._setStyle(node, obj.fill, obj.line, cxform);
                            }
                            break;
                        case "button":
                            var states1 = obj.states,
                                states2 = character._states = {},
                                btnCxform = obj.cxform;
                            for(var state in states1){
                                var list1 = states1[state],
                                    list2 = states2[state] || (states2[state] = {});
                                for(var depth in list1){
                                    var stateCharacter = list2[depth] = cloneCharacter(list1[depth]);
                                    t._cast(stateCharacter, cxform1 || btnCxform);
                                }
                            }
                            break;
                        case "text":
                            var strings = obj.strings,
                                numStrings = strings.length,
                                frag = doc.createDocumentFragment(),
                                matrix = cloneMatrix(obj.matrix);
                            for(var i = 0; i < numStrings; i++){
                                var useNode = frag.appendChild(t._createElement("use")),
                                    id = objId + (numStrings > 1 ? '_' + (i + 1) : ''),
                                    string = strings[i];
                                t._setAttributes(useNode, {href: '#t' + id}, NS_XLINK);
                                t._setStyle(useNode, string.fill, null, cxform);
                            }
                            if(strings.length > 1){
                                node = t._createElement('g');
                                node.appendChild(frag);
                            }else{ var node = frag.firstChild; }
                            attrs.transform = matrix2string(matrix);
                            break;
                    }
                    if(node){
                        t._setAttributes(node, attrs);
                        t._defs.appendChild(node);
                        t._set[characterId] = {
                            character: character,
                            node: node
                        };
                    }
                }
            }
            return t;
        },
        
        _setStyle: function(node, fill, line, cxform){
            var t = this,
                attrs = {};
            if(fill){
                var type = fill.type;
                if(fill.type){
                    var fillNode = t._defs.appendChild(t._buildFill(fill, cxform));
                    attrs.fill = "url(#" + fillNode.id + ')';
                }else{
                    var color = cxform ? transformColor(fill, cxform) : fill,
                        alpha = color.alpha;
                    attrs.fill = color2string(color);
                    if(undefined != alpha && alpha < 1){ attrs["fill-opacity"] = alpha; }
                }
            }else{ attrs.fill = "none"; }
            if(line){
                var color = cxform ? transformColor(line.color, cxform) : line.color,
                    alpha = color.alpha;
                attrs.stroke = color2string(color);
                attrs["stroke-width"] = max(line.width, 0.5);
                if(undefined != alpha && alpha < 1){ attr["stroke-opacity"] = alpha; }
            }
            t._setAttributes(node, attrs);
            return t;
        },
        
        _buildFill: function(fill, cxform){
            var t = this,
                f = t._fills,
                id = objectId({
                    fill: fill,
                    cxform: cxform
                }),
                node = f[id];
            if(!node){
                var type = fill.type,
                    attrs = {id: type[0] + id};
                switch(type){
                    case "linear":
                    case "radial":
                        node = t._createElement(type + "Gradient");
                        var s = Gordon.spreadModes,
                            i = Gordon.interpolationModes,
                            stops = fill.stops;
                        attrs.gradientUnits = "userSpaceOnUse";
                        attrs.gradientTransform = matrix2string(fill.matrix);
                        if("linear" == type){ 
                            attrs.x1 = -819.2;
                            attrs.x2 = 819.2;
                        }else{
                            attrs.cx = attrs.cy = 0;
                            attrs.r = 819.2;
                        }
                        switch(fill.spread){
                            case s.REFLECT:
                                attrs.spreadMethod = "reflect";
                                break;
                            case s.REPEAT:
                                attrs.spreadMethod = "repeat";
                                break;
                        }
                        if(fill.interpolation == i.LINEAR_RGB){ attrs["color-interpolation"] = "linearRGB"; }
                        stops.forEach(function(stop){
                            var stopNode = node.appendChild(t._createElement("stop")),
                                color = cxform ? transformColor(stop.color, cxform) : stop.color;
                            t._setAttributes(stopNode, {
                                offset: stop.offset,
                                "stop-color": color2string(color),
                                "stop-opacity": "alpha" in color ? 1 : color.alpha
                            });
                        });
                        break;
                    case "pattern":
                        node = t._createElement("pattern");
                        var fillImg = fill.image,
                            width = fillImg.width,
                            height = fillImg.height;
                        if(cxform){
                            var img = new Image(),
                                origin = doc.getElementById('i' + fillImg.id),
                                canvas = doc.createElement("canvas"),
                                ctx = canvas.getContext("2d"),
                                imgNode = node.appendChild(t._createElement("image"));
                            img.src = origin.getAttribute("href");
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0);
                            var imgData = ctx.getImageData(0, 0, width, height),
                                pxData = imgData.data,
                                len = pxData.length,
                                multR = cxform.multR,
                                multG = cxform.multG,
                                multB = cxform.multB,
                                addR = cxform.addR,
                                addG = cxform.addG,
                                addB = cxform.addB;
                            for(var i = 0; i < len; i+= 4){
                                pxData[i] = ~~max(0, min((pxData[i] * multR) + addR, 255));
                                pxData[i + 1] = ~~max(0, min((pxData[i + 1] * multG) + addG, 255));
                                pxData[i + 2] = ~~max(0, min((pxData[i + 2] * multB) + addB, 255));
                            }
                            ctx.putImageData(imgData, 0, 0);
                            t._setAttributes(imgNode, {href: canvas.toDataURL()}, NS_XLINK);
                            t._setAttributes(imgNode, {
                                width: width,
                                height: height,
                                opacity: ~~max(0, min(cxform.multA + cxform.addA, 1))
                            });
                        }else{
                            var useNode = node.appendChild(t._createElement("use"));
                            t._setAttributes(useNode, {href: "#i" + fillImg.id}, NS_XLINK);
                        }
                        attrs.patternUnits = "userSpaceOnUse";
                        attrs.patternTransform = matrix2string(fill.matrix);
                        attrs.width = width;
                        attrs.height = height;
                        break;
                }
                t._setAttributes(node, attrs);
                t._fills[id] = node;
            }
            return node;
        },
        
        show: function(frmIdx){
            var t = this,
                frm = t._timeline[frmIdx],
                d = frm.displayList;
            for(var depth in d){
                var character = d[depth];
                if(character){ t.place(character); }
                else{ t.remove(depth); }
            }
            return t;
        },
        
        place: function(character){
            var depth = character.depth,
                t = this,
                d = t._displayList,
                replace = d[depth];
            if(replace && !character.object){
                var id = character._id,
                    node = replace.node,
                    matrix = character.matrix;
                if(id != replace.character._id){ t._setAttributes(node, {href: "#c" + id}, NS_XLINK); }
                var matrix = character.matrix;
                if(matrix && matrix != replace.matrix){ t._setAttributes(node, {transform: matrix2string(matrix)}); }
            }else{
                if(character.clipDepth){
                    var node = t._createElement('g');
                    t._setAttributes(node, {"clip-path": "url(#p" + character.object + ')'});
                }else{ var node = t._prepare(character); }
                if(replace){ t.remove(depth); }
                var stage = t._stage;
                if(1 == depth){ stage.insertBefore(node, stage.firstChild); }
                else{
                    var nextDepth = 0;
                    for(var entry in d){
                        var c = d[entry].character;
                        if(c.clipDepth && depth <= c.clipDepth){ stage = d[entry].node; }
                        if(entry > depth){
                            nextDepth = entry;
                            break;
                        }
                    }
                    if(nextDepth){ stage.insertBefore(node, d[nextDepth].node); }
                    else{ stage.appendChild(node); }
                }
            }
            d[depth] = {
                character: character,
                node: node
            };
            return t;
        },
        
        _prepare: function(character){
            var t = this,
                obj = t._dictionary[character.object].object,
                type = obj.type,
                node = null,
                matrix = character.matrix;
            switch(type){
                case "button":
                    var node = t._createElement('g'),
                        states = character._states,
                        btnCxform = obj.cxform,
                        hitNode = null,
                        stateNodes = {},
                        frag = doc.createDocumentFragment(),
                        style = doc.body.style,
                        currState = b.UP,
                        m = Gordon.mouseButtons,
                        isMouseOver = false,
                        action = obj.action,
                        trackAsMenu = obj.trackAsMenu;
                    for(var state in states){
                        var stateFrag = doc.createDocumentFragment(),
                            list = states[state];
                        for(var depth in list){ stateFrag.appendChild(t._prepare(list[depth])); }
                        if(stateFrag.length > 1){
                            var stateNode = t._createElement('g');
                            stateNode.appendChild(stateFrag);
                        }else{ var stateNode = stateFrag.firstChild; }
                        if(state == b.HIT){
                            t._setAttributes(stateNode, {opacity: 0});
                            hitNode = stateNode;
                        }else{
                            t._setAttributes(stateNode, {visibility: state == b.UP ? "visible" : "hidden"});
                            stateNodes[state] = frag.appendChild(stateNode);
                        }
                    }
                    node.appendChild(frag);
                    node.appendChild(hitNode);
                    
                    function setState(state){
                        if(state == b.UP){ style.cursor = setState._cursor || "default"; }
                        else{
                            setState._cursor = style.cursor;
                            style.cursor = "pointer";
                        }
                        t._setAttributes(stateNodes[currState], {visibility: "hidden"});
                        t._setAttributes(stateNodes[state], {visibility: "visible"});
                        currState = state;
                    };
                    
                    hitNode.onmouseover = function(){
                        if(!(buttonMask & m.LEFT)){ setState(b.OVER); }
                        else if(this == t.eventTarget){ setState(b.DOWN); }
                        return false;
                    }
                    
                    hitNode.onmousedown = function(){
                        t.eventTarget = this;
                        setState(b.DOWN);
                        var handle = doc.addEventListener("mouseup", function(){
                            setState(b.UP);
                            doc.removeEventListener("mouseup", handle, true);
                            t.eventTarget = null;
                        }, true);
                        return false;
                    }
                    
                    hitNode.onmouseup = function(){
                        setState(b.OVER);
                        if(this == t.eventTarget){
                            if(action){ action(); }
                            t.eventTarget = null;
                        }
                        return false;
                    }
                    
                    hitNode.onmouseout = function(){
                        if(this == t.eventTarget){
                            if(trackAsMenu){
                                t.eventTarget = null;
                                setState(b.UP);
                            }else{ setState(b.OVER); }
                        }
                        else{ setState(b.UP); }
                        return false;
                    }
                    break;
                default:
                    var node = t._createElement("use");
                    t._setAttributes(node, {href: "#c" + character._id}, NS_XLINK);
            }
            if(matrix){ t._setAttributes(node, {transform: matrix2string(matrix)}); }
            return node;
        },
        
        remove: function(depth){
            var d = this._displayList,
                item = d[depth],
                node = item.node,
                parentNode = node.parentNode;
            if(item.character.clipDepth){
                var childNodes = node.childNodes;
                for(var c in childNodes){ parentNode.insertBefore(childNodes[c], node); }
            }
            parentNode.removeChild(node);
            delete d[depth];
            return this;
        }
    };
    
    var REGEXP_IS_COLOR = /^([\da-f]{1,2}){3}$/i;
    
    function color2string(color){
        if("string" == typeof color){ return REGEXP_IS_COLOR.test(color) ? color : null; }
        return "rgb(" + [color.red, color.green, color.blue] + ')';
    }
    
    function matrix2string(matrix){
        return "matrix(" + [
            matrix.scaleX, matrix.skewX,
            matrix.skewY, matrix.scaleY,
            matrix.moveX, matrix.moveY
        ] + ')';
    }
    
    function transformColor(color, cxform){
        return {
            red: ~~max(0, min((color.red * cxform.multR) + cxform.addR, 255)),
            green: ~~max(0, min((color.green * cxform.multG) + cxform.addG, 255)),
            blue: ~~max(0, min((color.blue * cxform.multB) + cxform.addB, 255)),
            alpha: ~~max(0, min((color.alpha * cxform.multA) + cxform.addA, 255))
        }
    }
    
    function objectId(obj){
        var memo = objectId._memo || (objectId._memo = {}),
            nextId = (objectId._nextId || (objectId._nextId = 1)),
            key = object2key(obj),
            origId = memo[key];
        if(!origId){ memo[key] = nextId; }
        return origId || objectId._nextId++;
    }
    
    function object2key(obj){
        var a = 1,
            b = 0;
        for(var prop in obj){
            var val = obj[prop];
            if("object" == typeof val){ a += object2key(val); }
            else{
                var buff = '' + val;
                for(var j = 0; buff[j]; j++){
                    a = (a + buff.charCodeAt(j)) % 65521;
                    b = (b + a) % 65521;
                }
            }
        }
        return (b << 16) | a;
    }
    
    function concatCxform(cxform1, cxform2){
        return{
            multR: cxform1.multR * cxform2.multR, multG: cxform1.multG * cxform2.multG,
            multB: cxform1.multB * cxform2.multB, multA: cxform1.multA * cxform2.multA,
            addR: cxform1.addR + cxform2.addR, addG: cxform1.addG + cxform2.addG,
            addB: cxform1.addB + cxform2.addB, addA: cxform1.addA + cxform2.addA
        }
    }
    
    function cloneCharacter(character){
        return {
            object: character.object,
            depth: character.depth,
            matrix: character.matrix,
            cxform: character.cxform
        };
    }
    
    function cloneMatrix(matrix){
        return {
            scaleX: matrix.scaleX, scaleY: matrix.scaleY,
            skewX: matrix.skewX, skewY: matrix.skewY,
            moveX: matrix.moveX, moveY: matrix.moveY
        };
    }
    
    if(doc){
        doc.addEventListener("mousedown", function(e){
            buttonMask |= 0x01 << e.button;
        }, true);
        doc.addEventListener("mouseup", function(e){
            buttonMask ^= 0x01 << e.button;
        }, true);
    }
})();
