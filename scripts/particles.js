"use strict";

/**
 * Static methods for accessing, configuring and building shaders related
 * to the Particle class.
 */
const ParticlesShaders = (function() {
  /* Private attributes */
  const encodingRawStr =
`const float MAX_SPEED = ___MAX_SPEED___;
const vec2 WORLD_SIZE = ___WORLD_SIZE___;
      
const float POS_BANDWIDTH = ___POS_BANDWIDTH___;//max(WORLD_SIZE.x,WORLD_SIZE.y) + 64.0;
const float SPEED_BANDWIDTH = 2.0 * MAX_SPEED;
       
vec2 decodeObstacle(vec4 texel)
{
    return 2.0 * texel.rg - 1.0;
}
      
float random(vec2 co)
{
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}`;
    
  const drawVertRawStr =
`#version 300 es
uniform float uPointSize;

layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aVel;

flat out vec4 color;
      
___ENCODING_COMMON___
      
void main(void)
{
    vec2 pos = aPos;
    vec2 vel = aVel;

    const vec4 slowColor = vec4(0.75,1,1,1);
    const vec4 fastColor = vec4(0, 0.2, 0.8, 1);
    float relativeSpeed = length(vel) / MAX_SPEED;
    float t = smoothstep(0.0, 1.0, relativeSpeed);
    color = mix(slowColor, fastColor, t);
          
    gl_Position = vec4(2.0 * pos / WORLD_SIZE, 0.9*relativeSpeed, 1.0);
    gl_PointSize = uPointSize;
}`;

  const drawFragStr =
`#version 300 es
precision mediump float;

flat in vec4 color;
      
out vec4 fragColor;

void main(void) {
  vec2 toCenter = 2.0 * (vec2(0.5) - gl_PointCoord.xy);
  float sqDist = dot(toCenter,toCenter);
  if (sqDist > 1.0)
    discard;
        
  fragColor = color;
}`;

  const updateVertRawStr =
`#version 300 es
      
uniform sampler2D uObstaclesBuffer;
    
uniform float uDt; //in seconds
uniform vec2 uAcceleration;

layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aVel;

out vec2 aNextPos;
out vec2 aNextVel;
      
___ENCODING_COMMON___
      
void main(void)
{
    vec2 pos = aPos;
    vec2 vel = aVel;
    vec2 acc = uAcceleration;

    vec2 nextVel = vel + uDt * acc;
    if (pos.y < -0.5 * WORLD_SIZE.y) {
        nextVel.x = 0.1 * MAX_SPEED * (2.0*random(100.0*pos) - 1.0);
        nextVel.y = random(pos + vel);
    }
      
    vec2 obstacleNormal = decodeObstacle(texture(uObstaclesBuffer, pos / WORLD_SIZE + 0.5));
    if (dot(obstacleNormal, obstacleNormal) > 0.1) {
        if (dot(nextVel, obstacleNormal) < 0.0) {
            nextVel = reflect(nextVel, normalize(obstacleNormal));
            nextVel *= min(1.0, 0.1*MAX_SPEED/length(nextVel));
        }
    }
      
    nextVel *= min(1.0, MAX_SPEED / length(nextVel));

    vec2 nextPos = pos + uDt * nextVel;
    {
      // Particles don't stay inside an obstacle
      vec2 obstacleNormal = decodeObstacle(texture(uObstaclesBuffer, nextPos / WORLD_SIZE + 0.5));
      nextPos += uDt * obstacleNormal;

      if (pos.y < -0.5 * WORLD_SIZE.y) {
          nextPos.x = (random(pos + vel) - 0.5) * WORLD_SIZE.x;
          nextPos.y += WORLD_SIZE.y + 0.5 * random(pos) * (POS_BANDWIDTH - WORLD_SIZE.y);
      }
      if (nextPos.x < -0.5 * POS_BANDWIDTH)
        nextPos.x += POS_BANDWIDTH;
      else if (nextPos.x > 0.5 * POS_BANDWIDTH)
        nextPos.x -= POS_BANDWIDTH;
    }

    aNextPos = nextPos;
    aNextVel = nextVel;
}`;

  const updateFragStr = 
`#version 300 es
void main(void) {
}`;
     
  let encodingStr, drawVertStr, updateVertStr;

  /* Public static methods */
  let visible = {
    setWorldSize: function(worldSize, posBandwidth, maxSpeed) {
      const worldSizeStr = "vec2(" + worldSize.width + "," + worldSize.height + ")";
      
      encodingStr = encodingRawStr.replace(/___MAX_SPEED___/g, maxSpeed.toFixed(1));
      encodingStr = encodingStr.replace(/___WORLD_SIZE___/g, worldSizeStr);
      encodingStr = encodingStr.replace(/___POS_BANDWIDTH___/g, posBandwidth.toFixed(1));
      
      drawVertStr = drawVertRawStr.replace(/___ENCODING_COMMON___/g, encodingStr);
      updateVertStr = updateVertRawStr.replace(/___ENCODING_COMMON___/g, encodingStr);
    },
    
    getDrawShader: function(gl) {
      return Shader.fromString(gl, drawVertStr, drawFragStr);
    },

    getUpdateShader: function (gl) {
      const transformFeedback = {
        varyings: ["aNextPos", "aNextVel"],
        bufferMode: gl.SEPARATE_ATTRIBS,
      };

      return Shader.fromString(gl, updateVertStr, updateFragStr, transformFeedback);

    }
  };
  
  return Object.freeze(visible);
})();


/**
 * Class for creating, updating and displaying a collection of particles.
 */
class Particles {
  /**
   * Constructor. The particles will be stored in texturees of size width*height,
   * so there will be width*height particles. Non-power-of-two values may not work
   * on certain platforms.
   * @param {WebGLRenderingContext} gl
   * @param {number} nb
   */
  constructor(gl, nb) {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    this._worldSize = {
      width: width,
      height: height
    };
    this._posBandwidth = 1.2 * Math.max(width, height);
    this._maxSpeed = 0.5 * Math.min(width, height);

    ParticlesShaders.setWorldSize(this._worldSize, this._posBandwidth, this._maxSpeed);
    this._drawShader = ParticlesShaders.getDrawShader(gl);
    this._updateShader = ParticlesShaders.getUpdateShader(gl);

    this.reset(gl, nb);
    
    this._currIndex = 0;
    this.acceleration = [0, -10000];
    this.pointSize = 2;
    this.speed = 1;
  }
  
  /**
   * Reinitializes the particles with random positions and velocities.
   * @param {WebGLRenderingContext} gl
   * @param {number} nb
   */
  reset(gl, nb) {
    this._nbParts = nb;
    let pos = [], vel = [];
    for (let i = 0; i < this.nbParticles; ++i) {
      pos.push((Math.random() - 0.5) * this._worldSize.width);//this._worldSize.x);
      pos.push((Math.random() - 0.5) * this._worldSize.height);//this._worldSize.y);
      vel.push(2 * (Math.random() - 0.5) * this._maxSpeed);
      vel.push(2 * (Math.random() - 0.5) * this._maxSpeed);
    }

    this._posVBO = [gl.createBuffer(), gl.createBuffer()];
    this._velVBO = [gl.createBuffer(), gl.createBuffer()];
    this._posVelVAO = [gl.createVertexArray(), gl.createVertexArray()];
    this._transformFeedback = [gl.createTransformFeedback(), gl.createTransformFeedback()];

    const posLoc = 0, velLoc = 1;
    for (let i = 0; i < 2; ++i) {//let vao in this._posVelVAO) {
      gl.bindVertexArray(this._posVelVAO[i]);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._posVBO[i]);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STREAM_COPY);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._velVBO[i]);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vel), gl.STREAM_COPY);
      gl.enableVertexAttribArray(velLoc);
      gl.vertexAttribPointer(velLoc, 2, gl.FLOAT, false, 0, 0);
      
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this._transformFeedback[i]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this._posVBO[i]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this._velVBO[i]);
    }
    gl.bindVertexArray(null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  
  set acceleration(vector) {
    this._updateShader.u["uAcceleration"].value = vector;
  }
  
  set pointSize(size) {
    this._drawShader.u["uPointSize"].value = size;
  }
  
  get nbParticles() {
    return this._nbParts;
  }

  get currIndex() {
    return this._currIndex;
  }

  get nextIndex() {
    return (this._currIndex + 1) % 2;
  }
  
  switchBuffers() {
    this._currIndex = this.nextIndex;
  }

  update(gl, obstacleMap, dt) {
    this._updateShader.u["uObstaclesBuffer"].value = obstacleMap.texture;
    this._updateShader.u["uDt"].value = this.speed * dt;

    gl.useProgram(this._updateShader);
    this._updateShader.bindUniforms(gl);

    const srcIndex = this.currIndex;
    const dstIndex = this.nextIndex;

    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this._transformFeedback[dstIndex]);
    gl.bindVertexArray(this._posVelVAO[srcIndex]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this._posVBO[dstIndex]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this._velVBO[dstIndex]);

    gl.enable(gl.RASTERIZER_DISCARD);

    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.nbParticles);
    gl.endTransformFeedback();

    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);

    this.switchBuffers();
  }

  draw(gl, obstacleMap, dt) {
    const currIndex = this.currIndex;

    gl.useProgram(this._drawShader);
    this._drawShader.bindUniforms(gl);

    const srcIndex = this.currIndex;
    
    gl.bindVertexArray(this._posVelVAO[srcIndex]);

    gl.enable(gl.DEPTH_TEST);
    gl.drawArrays(gl.POINTS, 0, this.nbParticles);
    gl.disable(gl.DEPTH_TEST);
    
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }
}