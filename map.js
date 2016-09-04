// constants
var TOTAL_WIDTH = $(window).width();
var TOTAL_HEIGHT = $(window).height();
var PRELOAD_RADIUS = 0.0; // how far off off-screen tiles are pre-loaded
var X_MIN = +0;
var X_MAX = +7;
var Y_MIN = -4;
var Y_MAX = +3;
var ZOOM_MIN = 1; // this means tiles are at most rendered at 1100x1100 [which is the full image resolution]
var ZOOM_MAX = 7;
var ZOOM_STEP = 0.5;

var MAX_FPS = 75;
var ANIMATE_SPEED = 400; // milliseconds
var SLIDE_ACCEL = 0.06;
var SLIDE_MAXSPEED = 0.01;
var EASING = $.easing['swing'];

var RESOLUTIONS = [0, 256, 512, 1024];
var THUMB_HANDOFF = 5000; // milliseconds. during this time a newly loaded thumb is rendered alongside the previous one to avoid white flickering.
var MAX_DOWNLOADS = 3; // number of images to download in parallel

// RollPlay campaign tiles start coordinates
var START_X = 0;
var START_Y = 0;

// ========================================================
// global variables
var currx = START_X;
var curry = START_Y;

var zoomlevel = 2.99; // zoomlevel x zoomlevel tile sizes are visible.

var keyLeft = false;
var keyRight = false;
var keyUp = false;
var keyDown = false;
var mouseHeld = false;
var mouseMoved = false;
var mouseHeldX, mouseHeldY;

var myFrameTimer = undefined;
var hintTimer = undefined;
var lastFrame = 0;
var animStart = {left: 0, top: 0, width: 0, height: 0};
var animTarget = {left: 0, top: 0, width: 0, height: 0};
var animProgress = 1.0; // 0.0 to 1.0 where 1.0 means complete
var slideSpeedX = 0.0;
var slideSpeedY = 0.0;

var tiles = new Array(); // 2-dim array of tile objects, each with the following fields:
// loaded: which resolutions of the tile have been loaded. -1: tile does not exist, otherwise: bitmask corresponding to RESOLUTIONS array.
// busy: which resolutions of the tile are busy being loaded. bitmask corresponding to RESOLUTIONS array.
// displayed: which resolution of the tile is currently being shown. 0: none, otherwise: corresponds to RESOLUTIONS array.
// handoff: a timeout used to smooth the handoff from one resolution to another one which is still being loaded.

var downloadCount = 0; // number of images currently being downloaded
var queuedDownloads = [];

var openTime = new Date().getTime();

// ========================================================
// initialization stuff
for (var i = X_MIN; i <= X_MAX; i++) {
    tiles[i] = new Array();
    for (var j = Y_MIN; j <= Y_MAX; j++) {
        tiles[i][j] = {loaded: 0, busy: 0, displayed: 0, handoff: undefined};
    }
}

for (var i = X_MIN; i <= X_MAX; i++) {
    for (var j = Y_MIN; j <= Y_MAX; j++) {
        tiles[i][j].loaded = 1 << RESOLUTIONS.length;
    }
}

$(window).resize(function() 
{
    TOTAL_WIDTH = $(window).width();
    TOTAL_HEIGHT = $(window).height();
    $('#holder').height(TOTAL_HEIGHT);
    $('#holder').width(TOTAL_WIDTH);
    var tileWidth = getTileWidth();
    var tileHeight = getTileHeight();
    animTarget.left = (TOTAL_WIDTH - tileWidth) / 2 - (currx - 0.5) * tileWidth;
    animTarget.top = (TOTAL_HEIGHT - tileHeight) / 2 + (curry - 0.5) * tileHeight;
    animTarget.width = tileWidth;
    animTarget.height = tileHeight;
    $('#base')    .css('left', animTarget.left + 'px')
                .css('top', animTarget.top + 'px')
                .css('width', animTarget.width + 'px')
                .css('height', animTarget.height + 'px')
    ;
    updateTiles();
});

$(document).ready(function() {
    $('#holder').height(TOTAL_HEIGHT);
    $('#holder').width(TOTAL_WIDTH);

    
    // parse url anchor
    processAnchor(false);
    
    // compute initial view
    var tileWidth = getTileWidth();
    var tileHeight = getTileHeight();
    animTarget.left = (TOTAL_WIDTH - tileWidth) / 2 - (currx - 0.5) * tileWidth;
    animTarget.top = (TOTAL_HEIGHT - tileHeight) / 2 + (curry - 0.5) * tileHeight;
    animTarget.width = tileWidth;
    animTarget.height = tileHeight;
    $('#base')    .css('left', animTarget.left + 'px')
                .css('top', animTarget.top + 'px')
                .css('width', animTarget.width + 'px')
                .css('height', animTarget.height + 'px')
    ;

    
    updateTiles();
});

function jumpTopoint(pointName)
{
    document.getElementById("searchbox").value = "";
    window.location.hash = " ";
    window.location.hash = "#" + pointName;
    $("#results").css("display", "none");
}
// ========================================================
// general helper functions

function getBestResolution(z) {
    if (arguments.length < 1)
        z = zoomlevel;

    var index = Math.floor((((RESOLUTIONS.length - 1) / ZOOM_MAX ) * z));
    index = RESOLUTIONS.length - 1 - index;
    if (index < 1)
        index = 1;
    if (index > RESOLUTIONS.length - 1)
        index = RESOLUTIONS.length - 1;
    return index;
}
function getTileWidth(z) {
    if (arguments.length < 1)
        z = zoomlevel;
    return RESOLUTIONS[RESOLUTIONS.length - 1] / z;
}
function getTileHeight(z) {
    if (arguments.length < 1)
        z = zoomlevel;
    return RESOLUTIONS[RESOLUTIONS.length - 1] / z;
}
function getTileX(mx, currx, zoomlevel) {
// returns the x coordinate for the mouse position mx
    var tileWidth = getTileWidth(zoomlevel);
    mx -= (TOTAL_WIDTH - tileWidth) / 2 - (currx - 0.5) * tileWidth;
    return mx / tileWidth;
}
function getTileY(my, curry, zoomlevel) {
// returns the y coordinate for the mouse position my
    var tileHeight = getTileHeight(zoomlevel);
    my -= (TOTAL_HEIGHT - tileHeight) / 2 + (curry + 0.5) * tileHeight;
    return -my / tileHeight;
}
function ease(start, target, progress) {
    return start + (target - start) * EASING(progress);
}
function startTimer() {
    if (!myFrameTimer) {
        lastFrame = $.now();
        myFrameTimer = setInterval(doFrame, 1000 / MAX_FPS);
    }
}
function processAnchor(animate) {
    if (!window.location.hash)
        return;
    var s = window.location.hash.substr(1);
    if (s == 'rollplay') {
        var x = START_X;
        var y = START_Y;
        var ZOOZOO = 2.99;
    } else {
        var i = s.indexOf(',');
        if (i < 0)
        {
            // it is not a coordinate, let's try if it is a point
            var pointFound = false;
            for (var point in MAP_POIs)
            {
                if (s == MAP_POIs[point]['name'])
                {
                    pointFound = true;
                    var x = MAP_POIs[point]['x'] + 0.5;
                    var y = MAP_POIs[point]['y'] + 0.5;
                    var ZOOZOO = ZOOM_MIN;
                    break;
                }
            }
            if(!pointFound)
                return;
        }
        else
        {
            var j = s.indexOf(',', i + 1);
            var ZOOZOO = ZOOM_MIN;
            if (j >= 0) {
                var z = parseFloat(s.substring(j + 1, s.length));
                if (!isNaN(z)) {
                    ZOOZOO = z;
                    if (ZOOZOO < ZOOM_MIN)
                        ZOOZOO = ZOOM_MIN;
                    if (ZOOZOO > ZOOM_MAX)
                        ZOOZOO = ZOOM_MAX;
                }
            } else {
                j = s.length;
            }
            var x = parseFloat(s.substring(0, i));
            var y = parseFloat(s.substring(i + 1, j));
            if (isNaN(x) || isNaN(y))
                return;
            
        }
    }

    if (arguments.length < 1 || animate) {
        setView(x, y, ZOOZOO);
    } else {
        currx = x;
        curry = y;
        zoomlevel = ZOOZOO;
    }
}
window.onhashchange = function () {
    processAnchor(true);
}

// ========================================================
// view manipulation functions
function doFrame() {
// advances zoom animations a frame. also used for arrow key scrolling.
    var now = $.now();
    
    // slide map (arrow keys)
    var slideAccel = SLIDE_ACCEL * ((now - lastFrame) / 1000);
    if (keyLeft)
        slideSpeedX -= slideAccel;
    if (keyRight)
        slideSpeedX += slideAccel;
    if (keyDown)
        slideSpeedY -= slideAccel;
    if (keyUp)
        slideSpeedY += slideAccel;
    slideSpeedX = Math.min(SLIDE_MAXSPEED, Math.max(-SLIDE_MAXSPEED, slideSpeedX));
    slideSpeedY = Math.min(SLIDE_MAXSPEED, Math.max(-SLIDE_MAXSPEED, slideSpeedY));
    if (keyLeft == keyRight) {
        if (slideSpeedX > 0)
            slideSpeedX = Math.max(0, slideSpeedX - slideAccel);
        else
            slideSpeedX = Math.min(0, slideSpeedX + slideAccel);
    }
    if (keyDown == keyUp) {
        if (slideSpeedY > 0)
            slideSpeedY = Math.max(0, slideSpeedY - slideAccel);
        else
            slideSpeedY = Math.min(0, slideSpeedY + slideAccel);
    }
    if (slideSpeedX != 0 || slideSpeedY != 0) {
        slideView(slideSpeedX * zoomlevel, slideSpeedY * zoomlevel);
    }
    
    // advance animation
    if (animProgress < 1.0) {
        animProgress += (now - lastFrame) / ANIMATE_SPEED;
        if (animProgress >= 1.0)
            animProgress = 1.0;
        $('#base')    .css('left', ease(animStart.left, animTarget.left, animProgress) + 'px')
                    .css('top', ease(animStart.top, animTarget.top, animProgress) + 'px')
                    .css('width', ease(animStart.width, animTarget.width, animProgress) + 'px')
                    .css('height', ease(animStart.height, animTarget.height, animProgress) + 'px')
        ;
    }
    
    // shut off timer if there's nothing to do
    if (animProgress >= 1.0 && slideSpeedX == 0 && slideSpeedY == 0) {
        clearInterval(myFrameTimer);
        myFrameTimer = undefined;
    }
    
    lastFrame = now;
}
function setView(x, y, z) {
// animates moving the view to center on (x, y) and changing zoomlevel to z
    if (arguments.length < 3) // keep the zoomlevel by default
        z = zoomlevel;
    
    currx = x;
    curry = y;
    zoomlevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    
    // set the start to wherever we are right now
    animStart.left = ease(animStart.left, animTarget.left, animProgress);
    animStart.top = ease(animStart.top, animTarget.top, animProgress);
    animStart.width = ease(animStart.width, animTarget.width, animProgress);
    animStart.height = ease(animStart.height, animTarget.height, animProgress);
    
    // compute the target
    var tileWidth = getTileWidth();
    var tileHeight = getTileHeight();
    animTarget.left = (TOTAL_WIDTH - tileWidth) / 2 - (currx - 0.5) * tileWidth;
    animTarget.top = (TOTAL_HEIGHT - tileHeight) / 2 + (curry - 0.5) * tileHeight;
    animTarget.width = tileWidth;
    animTarget.height = tileHeight;

    animProgress = 0.0;
    startTimer();
    
    updateTiles();
}
function slideView(xdiff, ydiff) {
// instantly move the view by (xdiff, ydiff) while preserving ongoing animations
    currx += xdiff;
    curry += ydiff;
    
    var leftDelta = -xdiff * getTileWidth(zoomlevel);
    var topDelta = ydiff * getTileHeight(zoomlevel);
    animStart.left += leftDelta;
    animTarget.left += leftDelta;
    animStart.top += topDelta;
    animTarget.top += topDelta;
    $('#base')    .css('left', '+=' + leftDelta)
                .css('top', '+=' + topDelta)
    ;
    
    updateTiles();
}

// ========================================================
// mouse and keyboard input
$(document).ready(function() {
    $('#holder').mousewheel(function(e, delta) {
        // when zooming with the mousewheel we want to zoom towards / away from the cursor
        var mouseX = e.pageX - this.offsetLeft;
        var mouseY = e.pageY - this.offsetTop;
        var oldTileX = getTileX(mouseX, currx, zoomlevel);
        var oldTileY = getTileY(mouseY, curry, zoomlevel);
        var newZoomlevel = zoomlevel + (delta > 0 ? -ZOOM_STEP : +ZOOM_STEP);
        if (newZoomlevel < ZOOM_MIN)
            newZoomlevel = ZOOM_MIN;
        if (newZoomlevel > ZOOM_MAX)
            newZoomlevel = ZOOM_MAX;
        var newTileX = getTileX(mouseX, currx, newZoomlevel);
        var newTileY = getTileY(mouseY, curry, newZoomlevel);
        
        setView(currx + oldTileX - newTileX, curry + oldTileY - newTileY, newZoomlevel);
        return false;
    });
    $('#holder').mousedown(function(e) {
        if (e.which == 1) {
            var mouseX = e.pageX - this.offsetLeft;
            var mouseY = e.pageY - this.offsetTop;
            mouseHeld = true;
            mouseMoved = false;
            mouseHeldX = getTileX(mouseX, currx, zoomlevel);
            mouseHeldY = getTileY(mouseY, curry, zoomlevel);
            return false;
        }
    });
    $('#holder').mousemove(function(e) {
        var mouseX = e.pageX - this.offsetLeft;
        var mouseY = e.pageY - this.offsetTop;
        var newX = getTileX(mouseX, currx, zoomlevel);
        var newY = getTileY(mouseY, curry, zoomlevel);
        $('#coords').text((newX - 0.5).toFixed(2) + ', ' + (newY - 0.5).toFixed(2));
        if (mouseHeld) {
            mouseMoved = true;
            slideView(mouseHeldX - newX, mouseHeldY - newY);
            return false;
        }
    });
    $('#holder').mouseup(function(e) {
        if (e.which == 1) {
                        mouseHeld = false;
            return false;
        }
    });
    $('#holder').mouseleave(function(e) {
        $('#coords').text('');
        mouseHeld = false;
        return false;
    });
    $('#holder').dblclick(function(e) {
        if (e.which == 1) {
            if (!mouseMoved) {
                var mouseX = e.pageX - this.offsetLeft;
                var mouseY = e.pageY - this.offsetTop;
                setView(getTileX(mouseX, currx, zoomlevel), getTileY(mouseY, curry, zoomlevel), ZOOM_MIN);
            }
        }
        return false;
    });

    $("#searchbox").keyup(function(e) {
        var inputString = document.getElementById("searchbox").value.toLowerCase(); // not sure why $("#searchbox").val() does not work :S
        if(inputString.length >= 3) 
        {
            // Only do this when we have at least 3 characters
            var matchedCities = new Array();
            for (var point in MAP_POIs)
            {
                var pointName = MAP_POIs[point]['name'].toString();
                var pointLowerCase = pointName.toLowerCase();
                if(e.keyCode == 13 && (pointLowerCase == inputString)) // enter
                {
                    document.getElementById("searchbox").value = "";
                    $("#results").empty();
                    $("#results").css("display", "none");
                    jumpTopoint(pointName);
                    return false;
                }
                else if (pointLowerCase.indexOf(inputString) != -1)
                {
                    matchedCities.push(pointName);
                }
            }
            if(matchedCities.length > 0)
            {
	            matchedCities.sort();
	            $("#results").empty();
	            for (var point in matchedCities)
	            {
	                var pointName = matchedCities[point];
	                $("#results").append("<div class=\"searchresult\"><a href=\"javascript:jumpTopoint('" + pointName.replace(/(['"])/g, "\\$1") + "');\">" + pointName + "</a></div>");

	            }
	            $("#results").css("display", "block");
        	}
        	else
        	{
        		$("#results").css("display", "none");		
        	}
        }
        else    
        {
            $("#results").css("display", "none");
        }
    });
});
$(document).keydown(function(e) {
        switch (e.keyCode) {
    case 37: // Left
        keyLeft = true;
        startTimer();
    break;
    case 38: // Up
        keyUp = true;
        startTimer();
    break;
    case 39: // Right
        keyRight = true;
        startTimer();
    break;
    case 40: // Down
        keyDown = true;
        startTimer();
    break;
    case 109: // Numpad -
        setView(currx, curry, zoomlevel + ZOOM_STEP);
    break;
    case 107: // Numpad +
        setView(currx, curry, zoomlevel - ZOOM_STEP);
    break;
    default:
        return true;
    }
    return false;
});
$(document).keyup(function(e) {
        switch (e.keyCode) {
    case 37: // Left
        keyLeft = false;
    break;
    case 38: // Up
        keyUp = false;
    break;
    case 39: // Right
        keyRight = false;
    break;
    case 40: // Down
        keyDown = false;
    break;
    default:
        return true;
    }
    return false;
});

// ========================================================
// functions concerned with loading and displaying tiles
function updateTiles() {
// triggers loading the tiles visible in the current view at the appropriate resolution
    queuedDownloads = []; // cancel pending but unstarted downloads
    var resolution = getBestResolution();
    var tileWidth = getTileWidth();
    var tileHeight = getTileHeight();

    var left = Math.floor(currx - TOTAL_WIDTH / tileWidth / 2 - PRELOAD_RADIUS);
    var right = Math.floor(currx + TOTAL_WIDTH / tileWidth / 2 + PRELOAD_RADIUS);
    var bottom = Math.floor(curry - TOTAL_HEIGHT / tileHeight / 2 - PRELOAD_RADIUS);
    var top = Math.floor(curry + TOTAL_HEIGHT / tileHeight / 2 + PRELOAD_RADIUS);
    var depth = Math.floor((Math.min(right - left, top - bottom) + 1 - 1) / 2);
    for (var i = depth; i >= 0; i--) { // load the centermost tiles first!
        for (var j = left + i; j <= right - i; j++) {
            displayTile(j, bottom + i, resolution);
            displayTile(j, top - i, resolution);
        }
        for (var j = bottom + i; j <= top - i; j++) {
            displayTile(left + i, j, resolution);
            displayTile(right - i, j, resolution);
        }
    }
}
function displayTile(x, y, r) {
// displays tile (x, y) at resolution r
    if (x < X_MIN || x > X_MAX || y < Y_MIN || y > Y_MAX || r <= 0)
        return;

    var tile = tiles[x][y];
    if (tile.loaded < 0)
        return;
        
    var link = "tiles/" + x + ',' + y + '.png?' + openTime;
    var thumblink;
    if (r < RESOLUTIONS.length - 1)
        thumblink = 't' + RESOLUTIONS[r] + '/' + x + ',' + y + '.png?' + openTime;
    else
        thumblink = link;
    
    if (tile.loaded == 0) {
        // we haven't checked the existence of this tile yet!
        if (downloadCount >= MAX_DOWNLOADS) {
            queuedDownloads.push({'x': x, 'y': y, 'r': r});
            return;
        }
        downloadCount++;
        tile.loaded = -1;
        $.ajax({
            url: link,
            cache: false,
            type: 'HEAD',
            success: function() {
                var newTile = $('<div id="' + link + '"><img src="' + thumblink + '" style="left: ' + (x * 100) + '%; bottom: ' + (y * 100) + '%;" x="' + x + '" y="' + y + '" r="' + r + '" /></div>');
                $('#base').append(newTile);
                newTile.click(function() {
                    return false;
                });
                tile.loaded = 1 << r;
                tile.displayed = r;
            },
            complete: function() {
                downloadCount--;
                nextDownload();
            }
        });
    } else if (tile.displayed != r) {
        // we know this tile exists, but we need to change the thumb level
        if ((tile.loaded & (1 << r)) != 0) {
            // we already loaded the desired thumb level
            clearHandoff(tile, x, y);
            if ((tile.busy & (1 << r)) != 0) {
                // still busy -- restore the handoff state!
                startHandoff(tile, x, y, r);
            } else {
                // default case
                if (tile.displayed < r) {
                    $('img[x=' + x + '][y=' + y + '][r=' + r + ']').css('display', '');
                    $('img[x=' + x + '][y=' + y + '][r!=' + r + ']').css('display', 'none');
                } else {
                    // delay displaying the lower resolution until the zoom finished!
                    setTimeout(function() {
                        // bail if zoom has changed
                        if (r != getBestResolution())
                            return;
                        $('img[x=' + x + '][y=' + y + '][r=' + r + ']').css('display', '');
                        $('img[x=' + x + '][y=' + y + '][r!=' + r + ']').css('display', 'none');
                    }, ANIMATE_SPEED);
                }
            }
            tile.displayed = r;
        } else if ((tile.busy & (1 << r)) == 0) {
            // we need to start downloading this thumb
            if (downloadCount >= MAX_DOWNLOADS) {
                queuedDownloads.push({'x': x, 'y': y, 'r': r});
                return;
            }
            downloadCount++;
            tile.busy |= (1 << r);

            // create the img element invisibly
            var newImage = $('<img src="" style="left: ' + (x * 100) + '%; bottom: ' + (y * 100) + '%; display: none;" x="' + x + '" y="' + y + '" r="' + r + '" />');
            var newTile = $('<div id="' + link + '"></a>');
            newTile.append(newImage);
            $('#base').append(newTile);
            newTile.click(function() {
                return false;
            });
            var safetyTimeout = setTimeout(function() { // rarely some browsers may raise neither load nor error event
                downloadCount--;
                nextDownload();
            }, 10000);
            newImage.load(function() {
                // we finished downloading the image, but having it ready for rendering may take another second or two...
                // hence the handoff period during which this thumb will remain marked as "busy".
                clearTimeout(safetyTimeout);
                downloadCount--;
                nextDownload();
                
                tile.loaded |= (1 << r);
                setTimeout(function() {
                    tile.busy &= ~(1 << r);
                }, THUMB_HANDOFF);
                
                // bail if zoom has changed during download
                if (r != getBestResolution())
                    return;
                
                // display the new thumbs
                clearHandoff(tile, x, y);
                startHandoff(tile, x, y, r);
                tile.displayed = r;
            }).error(function() {
                clearTimeout(safetyTimeout);
                downloadCount--;
                nextDownload();
            });

            // start downloading the image
            newImage.attr('src', thumblink);
        }
    }
}
function clearHandoff(tile, x, y) {
    if (tile.handoff !== undefined) {
        clearTimeout(tile.handoff);
        tile.handoff = undefined;
        $('img[x=' + x + '][y=' + y + ']').css('z-index', '');
    }
}
function startHandoff(tile, x, y, r) {
    $('img[x=' + x + '][y=' + y + '][r=' + r + ']').css('display', '').css('z-index', 1);
    tile.handoff = setTimeout(function() {
        $('img[x=' + x + '][y=' + y + '][r!=' + r + ']').css('display', 'none');
        $('img[x=' + x + '][y=' + y + '][r=' + r + ']').css('z-index', '');
        tile.handoff = undefined;
    }, THUMB_HANDOFF);
}
function nextDownload() {
    if (downloadCount >= MAX_DOWNLOADS)
        return;
    var next = queuedDownloads.shift();
    if (next !== undefined) {
        displayTile(next.x, next.y, next.r);
        nextDownload();
    }
}


