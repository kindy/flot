/* Flot plugin for showing crosshairs when the mouse hovers over the plot.

Copyright (c) 2007-2012 IOLA and Ole Laursen.
Licensed under the MIT license.

The plugin supports these options:

	crosshair: {
		mode: null or "x" or "y" or "xy"
		color: color
		lineWidth: number
	}

Set the mode to one of "x", "y" or "xy". The "x" mode enables a vertical
crosshair that lets you trace the values on the x axis, "y" enables a
horizontal crosshair and "xy" enables them both. "color" is the color of the
crosshair (default is "rgba(170, 0, 0, 0.80)"), "lineWidth" is the width of
the drawn lines (default is 1).

The plugin also adds four public methods:

  - setCrosshair( pos )

    Set the position of the crosshair. Note that this is cleared if the user
    moves the mouse. "pos" is in coordinates of the plot and should be on the
    form { x: xpos, y: ypos } (you can use x2/x3/... if you're using multiple
    axes), which is coincidentally the same format as what you get from a
    "plothover" event. If "pos" is null, the crosshair is cleared.

  - clearCrosshair()

    Clear the crosshair.

  - lockCrosshair(pos)

    Cause the crosshair to lock to the current location, no longer updating if
    the user moves the mouse. Optionally supply a position (passed on to
    setCrosshair()) to move it to.

    Example usage:

	var myFlot = $.plot( $("#graph"), ..., { crosshair: { mode: "x" } } };
	$("#graph").bind( "plothover", function ( evt, position, item ) {
		if ( item ) {
			// Lock the crosshair to the data point being hovered
			myFlot.lockCrosshair({
				x: item.datapoint[ 0 ],
				y: item.datapoint[ 1 ]
			});
		} else {
			// Return normal crosshair operation
			myFlot.unlockCrosshair();
		}
	});

  - unlockCrosshair()

    Free the crosshair to move again after locking it.
*/

(function ($) {
    var options = {
        crosshair: {
            mode: null, // one of null, "x", "y" or "xy",
            color: "rgba(170, 0, 0, 0.80)",
            lineWidth: 1
        }
    };
    
    function init(plot) {
        // position of crosshair in pixels
        var crosshair = { x: -1, y: -1, locked: false };

        plot.setCrosshair = function setCrosshair(pos) {
            if (!pos)
                crosshair.x = -1;
            else {
                var o = plot.p2c(pos);
                crosshair.x = Math.max(0, Math.min(o.left, plot.width()));
                crosshair.y = Math.max(0, Math.min(o.top, plot.height()));
            }
            
            plot.triggerRedrawOverlay();
        };
        
        plot.clearCrosshair = plot.setCrosshair; // passes null for pos
        
        plot.lockCrosshair = function lockCrosshair(pos) {
            if (pos)
                plot.setCrosshair(pos);
            crosshair.locked = true;
        };

        plot.unlockCrosshair = function unlockCrosshair() {
            crosshair.locked = false;
        };

        function onMouseOut(e) {
            if (crosshair.locked)
                return;

            if (crosshair.x != -1) {
                crosshair.x = -1;
                plot.triggerRedrawOverlay();
            }
        }

        function onMouseMove(e) {
            if (crosshair.locked)
                return;
                
            if (plot.getSelection && plot.getSelection()) {
                crosshair.x = -1; // hide the crosshair while selecting
                return;
            }
                
            var offset = plot.offset();
            crosshair.x = Math.max(0, Math.min(e.pageX - offset.left, plot.width()));
            crosshair.y = Math.max(0, Math.min(e.pageY - offset.top, plot.height()));

            var snapTo = plot.getOptions().crosshair.snapTo;
            if (snapTo != null) {
                var pos = plot.c2p({ left: e.pageX - offset.left, top: e.pageY - offset.top });

                var series = plot.getData()[snapTo];
                var i;
                for (i = 0; i < series.data.length; ++i) {
                    if (series.data[i][0] > pos.x) {
                        break;
                    }
                } 
                var p1 = i != 0 ? series.data[i - 1] : null;
                var p2 = i != series.data.length ? series.data[i] : null;
                var p,
                    idx = i;
                if (p1 == null) {
                    p = p2;
                } else if (p2 == null) {
                    p = p1;
                    idx -= 1;
                } else {
                    if (Math.abs(pos.x - p1[0]) < Math.abs(pos.x - p2[0])) {
                        p = p1;
                        idx -= 1;
                    } else {
                        p = p2;
                    }
                }
                var canvasCoords = plot.p2c({x: p[0], y: p[1]});
                crosshair.x = canvasCoords.left;
                crosshair.y = canvasCoords.top;

                crosshair.idx = idx;
            }

            plot.triggerRedrawOverlay();
        }
        
        plot.hooks.bindEvents.push(function (plot, eventHolder) {
            if (!plot.getOptions().crosshair.mode)
                return;

            eventHolder.mouseout(onMouseOut);
            eventHolder.mousemove(onMouseMove);
        });

        plot.hooks.drawOverlay.push(function (plot, ctx) {
            var c = plot.getOptions().crosshair;
            if (!c.mode)
                return;

            var plotOffset = plot.getPlotOffset();
            
            ctx.save();
            ctx.translate(plotOffset.left, plotOffset.top);

            if (crosshair.x != -1) {
                var adj = plot.getOptions().crosshair.lineWidth % 2 === 0 ? 0 : 0.5;

                ctx.strokeStyle = c.color;
                ctx.lineWidth = c.lineWidth;
                ctx.lineJoin = "round";

                ctx.beginPath();
                if (c.mode.indexOf("x") != -1) {
                    var drawX = Math.round(crosshair.x) + adj;
                    ctx.moveTo(drawX, 0);
                    ctx.lineTo(drawX, plot.height());
                }
                if (c.mode.indexOf("y") != -1) {
                    var drawY = Math.round(crosshair.y) + adj;
                    ctx.moveTo(0, drawY);
                    ctx.lineTo(plot.width(), drawY);
                }
                ctx.stroke();

                if (c.snapTo != null && c.mode.indexOf("d") != -1) {
                    (function() {
                        var data = plot.getData(),
                            opt = c.dotStyle || {},
                            pos,
                            idx = crosshair.idx;

                        ctx.lineWidth = opt.lineWidth || 2;

                        for (var i = data.length - 1; i >= 0; --i) {
                            ctx.strokeStyle = opt.color === 'auto' ? data[i].color : opt.color;
                            ctx.beginPath();
                            pos = plot.p2c({x: data[i].data[idx][0], y: data[i].data[idx][1]});
                            ctx.arc(pos.left, pos.top, opt.radius || 2, 0, 2 * Math.PI, false);
                            if (opt.fillColor) {
                                ctx.fillStyle = opt.fillColor;
                                ctx.fill();
                            }
                            ctx.stroke();
                        }
                    })();
                }

                if (c.onDraw) {
                    c.onDraw({x: crosshair.x, y: crosshair.y, idx: crosshair.idx});
                }
            } else if (c.onClear) {
                c.onClear();
            }

            ctx.restore();
        });

        plot.hooks.shutdown.push(function (plot, eventHolder) {
            eventHolder.unbind("mouseout", onMouseOut);
            eventHolder.unbind("mousemove", onMouseMove);
        });
    }
    
    $.plot.plugins.push({
        init: init,
        options: options,
        name: 'crosshair',
        version: '1.0'
    });
})(jQuery);
