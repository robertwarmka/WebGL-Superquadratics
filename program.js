var canvas;
var gl;
var programId;

// Define two constants (by convention) for the number of subdivisions of u and v.
var SUBDIV_U = 32;
var SUBDIV_V = 16;

// Lighting stuff
var lightPosition = vec4(5.0, 5.0, 5.0, 0.0 );
var lightAmbient = vec4(0.2, 0.2, 0.2, 1.0 );
var lightDiffuse = vec4( 1.0, 1.0, 1.0, 1.0 );
var lightSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );

var materialAmbient = vec4( 0.6, 0.6, 0.2, 1.0 );
var materialDiffuse = vec4( 1.0, 1.0, 0.0, 1.0 );
var materialSpecular = vec4( 0.7, 0.7, 0.7, 1.0 );
var materialShininess = 15.0;
var renderTexture = 0;
var shiftPressed = 0;
var shiftReleased = 0;

// Binds "on-change" events for the controls on the web page
function initControlEvents() {
    // Use one event handler for all of the shape controls
    document.getElementById("shape-select").onchange = 
    document.getElementById("superquadric-constant-n1").onchange = 
    document.getElementById("superquadric-constant-n2").onchange = 
    document.getElementById("superquadric-constant-a").onchange =
    document.getElementById("superquadric-constant-b").onchange =
    document.getElementById("superquadric-constant-c").onchange =
    document.getElementById("superquadric-constant-d").onchange =
        function(e) {
            var shape = document.getElementById("shape-select").value;
            
            // Disable the "d" parameter if the shape is not a supertorus
            if (shape === "supertorus") {
                document.getElementById("superquadric-constant-d").disabled = false;
            }
            else {
                document.getElementById("superquadric-constant-d").disabled = true;
            }
            
            // Regenerate the vertex data
            updateFaces(superquadrics[document.getElementById("shape-select").value],
                getSuperquadricConstants(), SUBDIV_U, SUBDIV_V);
        };
    
	// Event handler for the material selection
	document.getElementById("material-select").onchange =
		function(e) {
			updateMaterial(document.getElementById("material-select").value);
		};
	
    // Event handler for the foreground color control
    document.getElementById("foreground-color").onchange = 
        function(e) {
            updateWireframeColor(getWireframeColor());
        };
        
    // Event handler for the FOV control
    document.getElementById("fov").onchange =
        function(e) {
            updateProjection(perspective(getFOV(), 1, 0.01, 100));
        };
}

// Function for querying the current superquadric constants: a, b, c, d, n1, n2
function getSuperquadricConstants() {
    return {
        a: parseFloat(document.getElementById("superquadric-constant-a").value),
        b: parseFloat(document.getElementById("superquadric-constant-b").value),
        c: parseFloat(document.getElementById("superquadric-constant-c").value),
        d: parseFloat(document.getElementById("superquadric-constant-d").value),
        n1: parseFloat(document.getElementById("superquadric-constant-n1").value),
        n2: parseFloat(document.getElementById("superquadric-constant-n2").value)
    }
}

// Function for querying the current wireframe color
function getWireframeColor() {
    var hex = document.getElementById("foreground-color").value;
    var red = parseInt(hex.substring(1, 3), 16);
    var green = parseInt(hex.substring(3, 5), 16);
    var blue = parseInt(hex.substring(5, 7), 16);
    return vec3(red / 255.0, green / 255.0, blue / 255.0);
}

// Function for querying the current field of view
function getFOV() {
    return parseFloat(document.getElementById("fov").value);
}

window.onload = function() {
    // Find the canvas on the page
    canvas = document.getElementById("gl-canvas");
    
    // Initialize a WebGL context
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { 
        alert("WebGL isn't available"); 
    }
    
    // Load shaders
    programId = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(programId);
	gl.enable(gl.DEPTH_TEST);
    //gl.depthFunc(gl.LEQUAL);
    // Set up events for the HTML controls
    initControlEvents();

    // Setup mouse and keyboard input
    initWindowEvents();
    
    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    
    // Load the initial data into the GPU
    wireframeBufferId = gl.createBuffer();
	normalsBufferId = gl.createBuffer();
	textureBufferId = gl.createBuffer();
	
	findShaderVariables();
	
	viewMatrix = lookAt(vec3(0,0,5), vec3(0,0,0), vec3(0,1,0));
	
    updateFaces(superquadrics.superellipsoid, getSuperquadricConstants(), SUBDIV_U, SUBDIV_V);

	var image = document.getElementById("texImage");
	configureTexture( image );
	
    // Associate the shader variable for position with our data buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, wireframeBufferId );
    var vPosition = gl.getAttribLocation(programId, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);
    
	gl.bindBuffer(gl.ARRAY_BUFFER, normalsBufferId );
	var vNormal = gl.getAttribLocation(programId, "vNormal");
    gl.vertexAttribPointer(vNormal, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, textureBufferId);
	var vTexCoord = gl.getAttribLocation( programId, "vTexCoord" );
    gl.vertexAttribPointer( vTexCoord, 2, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vTexCoord );
	
	ambientProduct = mult(lightAmbient, materialAmbient);
    diffuseProduct = mult(lightDiffuse, materialDiffuse);
    specularProduct = mult(lightSpecular, materialSpecular);
	
	gl.uniform4fv( gl.getUniformLocation(programId,
       "ambientProduct"),flatten(ambientProduct) );
    gl.uniform4fv( gl.getUniformLocation(programId,
       "diffuseProduct"),flatten(diffuseProduct) );
    gl.uniform4fv( gl.getUniformLocation(programId,
       "specularProduct"),flatten(specularProduct) );
    gl.uniform4fv( gl.getUniformLocation(programId,
       "lightPosition"),flatten(lightPosition) );
    gl.uniform1f( gl.getUniformLocation(programId,
       "shininess"),materialShininess );
	gl.uniform1i( gl.getUniformLocation(programId,
	   "renderTexture"),renderTexture );
	
    // Initialize the view and rotation matrices
    rotationMatrix = mat4(1);
	lightRotationMatrix = mat4(1);
    updateModelView(viewMatrix);
    
    // Initialize the projection matrix
    updateProjection(perspective(getFOV(), 1, 0.01, 100));

    // Start continuous rendering
    window.setInterval(render, 33);
	//render();
};

// The current view matrix
var viewMatrix;
var normalMatrix;

// The current rotation matrix produced as the result of cumulative mouse drags.
// I chose to implement the effect of mouse dragging as "rotating the object."
// It would also be acceptable to implement it as "moving the camera."
var rotationMatrix;
var lightRotationMatrix;

// The OpenGL ID of the vertex buffer containing the current shape
var wireframeBufferId;

// The OpenGL ID of the normals buffer containing each triangle's normal vector
var normalsBufferId;

// The OpenGL ID of the texture buffer containing each triangle's texture coordinates
var textureBufferId;

// The number of vertices in the current vertex buffer
var wireframePointCount;

// Sets up keyboard and mouse events
function initWindowEvents() {

    // Affects how much the camera moves when the mouse is dragged.
    var sensitivity = 1;

    // Additional rotation caused by an active drag.
    var newRotationMatrix;
	var newLightRotationMatrix;
    
    // Whether or not the mouse button is currently being held down for a drag.
    var mousePressed = false;
    
    // The place where a mouse drag was started.
    var startX, startY;

    canvas.onmousedown = function(e) {
        // A mouse drag started.
        mousePressed = true;
        
        // Remember where the mouse drag started.
        startX = e.clientX;
        startY = e.clientY;
    }

    canvas.onmousemove = function(e) {
        if (mousePressed) {
            // Handle a mouse drag by constructing an axis-angle rotation matrix
			/*if(shiftReleased == 1) {
				startX = e.clientX;
				startY = e.clientY;
			}*/
            var axis = vec3(e.clientY - startY, e.clientX - startX, 0.0);
            var angle = length(axis) * sensitivity;
            if (angle > 0.0) {
				// Update the temporary rotation matrix
				if(shiftPressed == 1) {
					// Update the light position matrix.
					newLightRotationMatrix = mult(rotate(angle, axis), lightRotationMatrix);
					var newLightPos = vec4();
					for(var i = 0; i < 4; i++) {
						for(var j = 0; j < 4; j++) {
							newLightPos[i] = newLightPos[i] + lightPosition[i] * newLightRotationMatrix[i][j];
						}
					}
					updateLightPosition(newLightPos);
				}
				else {
					// Update the model-view matrix.
					var rotationM = rotate(angle, axis);
					newRotationMatrix = mult(rotate(angle, axis), rotationMatrix);
					updateModelView(mult(viewMatrix, newRotationMatrix));
				}
            }
        }
    }

    window.onmouseup = function(e) {
        // A mouse drag ended.
        mousePressed = false;
        
		if(newLightRotationMatrix) {
			lightRotationMatrix = newLightRotationMatrix;
		}
		newLightRotationMatrix = null;
		
        if (newRotationMatrix) {
            // "Lock" the temporary rotation as the current rotation matrix.
            rotationMatrix = newRotationMatrix;
        }
        newRotationMatrix = null;
    }
    
    var speed = 0.1; // Affects how fast the camera pans and "zooms"
    window.onkeydown = function(e) {
        if (e.keyCode === 190) { // '>' key
            // "Zoom" in
            viewMatrix = mult(translate(0,0,speed), viewMatrix);
        }
        else if (e.keyCode === 188) { // '<' key
            // "Zoom" out
            viewMatrix = mult(translate(0,0,-speed), viewMatrix);
        }
        else if (e.keyCode === 37) { // Left key
            // Pan left
            viewMatrix = mult(translate(speed,0,0), viewMatrix);
            
            // Prevent the page from scrolling, which is the default behavior for the arrow keys
            e.preventDefault(); 
        }
        else if (e.keyCode === 38) { // Up key
            // Pan up
            viewMatrix = mult(translate(0,-speed,0), viewMatrix);
            
            // Prevent the page from scrolling, which is the default behavior for the arrow keys
            e.preventDefault();
        }
        else if (e.keyCode === 39) { // Right key
            // Pan right
            viewMatrix = mult(translate(-speed,0,0), viewMatrix);
            
            // Prevent the page from scrolling, which is the default behavior for the arrow keys
            e.preventDefault();
        }
        else if (e.keyCode === 40) { // Down key
            // Pan down 
            viewMatrix = mult(translate(0,speed,0), viewMatrix);
            
            // Prevent the page from scrolling, which is the default behavior for the arrow keys
            e.preventDefault();
        }
		else if(e.keyCode === 16) {
			shiftPressed = 1;
		}
        
        // Update the model-view matrix and render.
        updateModelView(mult(viewMatrix, rotationMatrix));
        render();
    }
	
	window.onkeyup = function(e) {
		if(e.keyCode === 16) {
			shiftPressed = 0;
			startX = e.clientX;
			startY = e.clientY;
		}
	}
}

// Define the four possible superquadrics
var superquadrics = {
    superellipsoid: {
        evaluate: function(constants, u, v) {
            var cosU = Math.cos(u);
            var sinU = Math.sin(u);
            var cosV = Math.cos(v);
            var sinV = Math.sin(v);
            return vec3(
                constants.a * Math.sign(cosV * cosU) * Math.pow(Math.abs(cosV), 2 / constants.n1) * 
                    Math.pow(Math.abs(cosU), 2 / constants.n2),
                constants.b * Math.sign(cosV * sinU) * Math.pow(Math.abs(cosV), 2 / constants.n1) * 
                    Math.pow(Math.abs(sinU), 2/constants.n2),
                constants.c * Math.sign(sinV) * Math.pow(Math.abs(sinV), 2 / constants.n1)
            );
        },
        uMin: -Math.PI,
        uMax: Math.PI,
        vMin: -Math.PI / 2,
        vMax: Math.PI / 2
    },
    superhyperboloidOneSheet: {
        evaluate: function(constants, u, v) {
            var cosU = Math.cos(u);
            var sinU = Math.sin(u);
            var secV = 1 / Math.cos(v);
            var tanV = Math.tan(v);
            return vec3(
                constants.a * Math.sign(secV * cosU) * Math.pow(Math.abs(secV), 2 / constants.n1) * 
                    Math.pow(Math.abs(cosU), 2 / constants.n2),
                constants.b * Math.sign(secV * sinU) * Math.pow(Math.abs(secV), 2 / constants.n1) * 
                    Math.pow(Math.abs(sinU), 2/constants.n2),
                constants.c * Math.sign(tanV) * Math.pow(Math.abs(tanV), 2 / constants.n1)
            );
        },
        uMin: -Math.PI,
        uMax: Math.PI,
        // v = -pi/4 to pi/4 gives a reasonable view of most superhyperboloids 
        // (which are technically infinite)
        vMin: -Math.PI / 4, 
        vMax: Math.PI / 4
    },
    superhyperboloidTwoSheets: {
        evaluate: function(constants, u, v) {
            var eps = -0.001; // Avoid floating-point precision issues
            if (u < -Math.PI / 4 - eps || u > 5 * Math.PI / 4 + eps || 
                (u > Math.PI / 4 + eps && u < 3 * Math.PI / 4 - eps)) {
                // Return NaN if the value of u causes the function to take on an "extreme" value
                // (specifically, restrict u to be between -pi/4 and pi/4 or between 3pi/4 and 5pi/4)
                return vec3(NaN, NaN, NaN);
            }
            else {
                var secU = 1 / Math.cos(u);
                var tanU = Math.tan(u);
                var secV = 1 / Math.cos(v);
                var tanV = Math.tan(v);
                return vec3(
                    constants.a * Math.sign(secV * secU) * Math.pow(Math.abs(secV), 2 / constants.n1) * 
                        Math.pow(Math.abs(secU), 2 / constants.n2),
                    constants.b * Math.sign(secV * tanU) * Math.pow(Math.abs(secV), 2 / constants.n1) * 
                        Math.pow(Math.abs(tanU), 2/constants.n2),
                    constants.c * Math.sign(tanV) * Math.pow(Math.abs(tanV), 2 / constants.n1)
                );
            }
        },
        uMin: -Math.PI / 2,
        uMax: 3 * Math.PI / 2,
        // v = -pi/4 to pi/4 gives a reasonable view of most superhyperboloids 
        // (which are technically infinite)
        vMin: -Math.PI / 4,
        vMax: Math.PI / 4
    },
    supertorus: {
        evaluate: function(constants, u, v) {
            var cosU = Math.cos(u);
            var sinU = Math.sin(u);
            var cosV = Math.cos(v);
            var sinV = Math.sin(v);
            return vec3(
                constants.a * Math.sign(cosU) * 
                    (constants.d + Math.sign(cosV) * Math.pow(Math.abs(cosV), 2 / constants.n1)) * 
                    Math.pow(Math.abs(cosU), 2 / constants.n2),
                constants.b * Math.sign(sinU) * 
                    (constants.d + Math.sign(cosV) * Math.pow(Math.abs(cosV), 2 / constants.n1)) * 
                    Math.pow(Math.abs(sinU), 2/constants.n2),
                constants.c * Math.sign(sinV) * Math.pow(Math.abs(sinV), 2 / constants.n1)
            );
        },
        uMin: -Math.PI,
        uMax: Math.PI,
        vMin: -Math.PI,
        vMax: Math.PI
    }
}

var points;

// Re-generates the faces of the superquadric.
function updateFaces(superquadric, constants, subdivU, subdivV) {
    // Initialize an empty array of points
    points = [];
	var normals = [];
	var texCoords = [];
    
	var texture;

	var texCoord = [
		vec2(0, 0),
		vec2(0, 1),
		vec2(1, 1),
		vec2(1, 0)
	];
	
    // Determine how much u and v change with each segment
    var du = (superquadric.uMax - superquadric.uMin) / subdivU;
    var dv = (superquadric.vMax - superquadric.vMin) / subdivV;
    
    // Reset the vertex count to 0
    wireframePointCount = 0;
    
    // Loop over u and v, generating all the required line segments
    for (var i = 0; i < subdivU; i++) {
        for (var j = 0; j < subdivV; j++) {
            // Determine u and v
            var u = superquadric.uMin + i * du;
            var v = superquadric.vMin + j * dv;
        
            // p is the "current" point at surface coordinates (u,v)
            var p = vec4(superquadric.evaluate(constants, u, v), 1.0);
            
            // pu is the point at surface coordinates (u+du, v)
            var pu = vec4(superquadric.evaluate(constants, u + du, v), 1.0);
            
            // pv is the point at surface coordinates (u, v+dv)
            var pv = vec4(superquadric.evaluate(constants, u, v + dv), 1.0);
			
			// puv is the point at surface coordinates (u+du, v+dv)
			var puv = vec4(superquadric.evaluate(constants, u + du, v + dv), 1.0);
			
			var t1;
			var t2;
			var normal;
            
            // Verify that all the points actually used are not infinite or NaN
            // (Could be an issue for hyperboloids)
			if (isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]) &&
					isFinite(pu[0]) && isFinite(pu[1]) && isFinite(pu[2]) &&
					isFinite(pv[0]) && isFinite(pv[1]) && isFinite(pv[2])) {
				
				t1 = subtract(pu, p);
				t2 = subtract(pv, p);
				normal = normalize(cross(t2, t1));
				normal = vec4(normal);
				normal[3]  = 0.0;

				normals.push(normal);
				normals.push(normal);
				normals.push(normal);
				
				points.push(p);
				points.push(pu);
				points.push(pv);
				
				texCoords.push(texCoord[0]);
				texCoords.push(texCoord[1]);
				texCoords.push(texCoord[2]);
				
				wireframePointCount += 3;
			}
			if (isFinite(puv[0]) && isFinite(puv[1]) && isFinite(puv[2]) &&
					isFinite(pu[0]) && isFinite(pu[1]) && isFinite(pu[2]) &&
					isFinite(pv[0]) && isFinite(pv[1]) && isFinite(pv[2])) {
				
				t1 = subtract(puv, pu);
				t2 = subtract(pv, pu);
				normal = normalize(cross(t2, t1));
				normal = vec4(normal);
				normal[3]  = 0.0;

				normals.push(normal);
				normals.push(normal);
				normals.push(normal);
				
				points.push(puv);
				points.push(pv);
				points.push(pu);
				
				texCoords.push(texCoord[3]);
				texCoords.push(texCoord[2]);
				texCoords.push(texCoord[1]);
				
				wireframePointCount += 3;
			}
            v += dv;
        }
        v = superquadric.vMax;
        u += du;
    }
    
    u = superquadric.uMax;
    
    // Pass the new set of vertices to the graphics card
	gl.bindBuffer(gl.ARRAY_BUFFER, normalsBufferId );
	gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.DYNAMIC_DRAW);
	
    gl.bindBuffer(gl.ARRAY_BUFFER, wireframeBufferId );
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.DYNAMIC_DRAW);
	
	gl.bindBuffer( gl.ARRAY_BUFFER, textureBufferId );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(texCoords), gl.STATIC_DRAW );
}

// The locations of the required GLSL uniform variables.
var locations = {};

// Looks up the locations of uniform variables once.
function findShaderVariables() {
    locations.modelView = gl.getUniformLocation(programId, "modelView");
	locations.normalMatrix = gl.getUniformLocation(programId, "normalMatrix");
    locations.projection = gl.getUniformLocation(programId, "projection");
	locations.renderTex = gl.getUniformLocation(programId, "renderTexture");
	locations.lightPosition = gl.getUniformLocation(programId, "lightPosition");
}

// Pass an updated model-view matrix to the graphics card.
function updateModelView(modelView) {
	normalMatrix = [
        vec3(modelView[0][0], modelView[1][0], modelView[2][0]),
        vec3(modelView[0][1], modelView[1][1], modelView[2][1]),
        vec3(modelView[0][2], modelView[1][2], modelView[2][2])
    ];
    gl.uniformMatrix4fv(locations.modelView, false, flatten(modelView));
	gl.uniformMatrix3fv(locations.normalMatrix, false, flatten(normalMatrix) );
}

// Pass an updated light-position matrix to the graphics card.
function updateLightPosition(lightPosition) {
	gl.uniform4fv(locations.lightPosition, flatten(lightPosition));
}

// Pass an updated projection matrix to the graphics card.
function updateProjection(projection) {
    gl.uniformMatrix4fv(locations.projection, false, flatten(projection));
}

// Update the lighting data/change texture flags to properly display the selected material
function updateMaterial(material) {
	if(material == "yellowPlastic") {
		materialAmbient = vec4( 0.6, 0.6, 0.2, 1.0 );
		materialDiffuse = vec4( 1.0, 1.0, 0.0, 1.0 );
		materialSpecular = vec4( 0.7, 0.7, 0.7, 1.0 );
		materialShininess = 15.0;
		configureLight();
		renderTexture = 0;
		updateRenderTexture(renderTexture);
	}
	else if(material == "brassMetal") {
		materialAmbient = vec4( 0.35, 0.25, 0.15, 1.0 );
		materialDiffuse = vec4( 0.15, 0.05, 0.0, 1.0 );
		materialSpecular = vec4( 1.0, 0.8, 0.4, 1.0 );
		materialShininess = 5.0;
		configureLight();
		renderTexture = 0;
		updateRenderTexture(renderTexture);
	}
	else if(material == "textureMap") {
		materialAmbient = vec4( 1.0, 1.0, 1.0, 1.0 );
		materialDiffuse = vec4( 1.0, 1.0, 1.0, 1.0 );
		materialSpecular = vec4( 0.0, 0.0, 0.0, 1.0 );
		materialShininess = 0.0;
		configureLight();
		renderTexture = 1;
		updateRenderTexture(renderTexture);
	}
}

function configureLight() {
	ambientProduct = mult(lightAmbient, materialAmbient);
    diffuseProduct = mult(lightDiffuse, materialDiffuse);
    specularProduct = mult(lightSpecular, materialSpecular);
	
	gl.uniform4fv( gl.getUniformLocation(programId, 
       "ambientProduct"),flatten(ambientProduct) );
    gl.uniform4fv( gl.getUniformLocation(programId, 
       "diffuseProduct"),flatten(diffuseProduct) );
    gl.uniform4fv( gl.getUniformLocation(programId, 
       "specularProduct"),flatten(specularProduct) );
	gl.uniform1f( gl.getUniformLocation(programId,
	   "shininess"), materialShininess );
}

function configureTexture( image ) {
    texture = gl.createTexture();
    gl.bindTexture( gl.TEXTURE_2D, texture );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGB, 
         gl.RGB, gl.UNSIGNED_BYTE, image );
    gl.generateMipmap( gl.TEXTURE_2D );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, 
                      gl.NEAREST_MIPMAP_LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
    
    gl.uniform1i(gl.getUniformLocation(programId, "texture"), 0);
}

function updateRenderTexture(renderBool) {
	gl.uniform1i(locations.renderTex, renderBool);
}

// Pass an updated projection matrix to the graphics card.
function updateWireframeColor(wireframeColor) {
    gl.uniform3fv(locations.wireframeColor, wireframeColor);
}

// Render the scene
function render() {
    // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Draw the shape using gl.TRIANGLES
	for(var i = 0; i < wireframePointCount; i+=3) {
		gl.drawArrays( gl.TRIANGLES, i, 3 );
	}
}