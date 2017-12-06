"use strict";


/**
 * Module for accessing, configuring and building shaders related
 * to the ObstacleMap class.
 */
const ObstacleMapShaders = (function () {
  /* Private static attributes */
  const addStaticVertStr =
      `#version 300 es
      uniform vec2 uMousePos; //in [0,1]x[0,1]
      uniform vec2 uBrushSize; //relative with the canvas size
      
      layout(location=0) in vec2 aCorner; //in {0,1}x{0,1}

      out vec2 fromCenter; //normalized with the brush size
      
      void main(void) {
          fromCenter = 2.0 * aCorner - 1.0;
        
          vec2 c = uMousePos + uBrushSize * (aCorner - 0.5);
          gl_Position = vec4(2.0*c - 1.0, 0.0, 1.0);
      }`;
  
  const addStaticFragStr =
      `#version 300 es
      precision mediump float;

      in vec2 fromCenter;
      
      out vec4 fragColor;

      void main(void) {
          if (dot(fromCenter, fromCenter) > 1.0) {
              discard;
          }
          
          vec2 normal = normalize(fromCenter);
          fragColor = vec4(0.5*normal + 0.5, 0, 1);
      }`;

  const addMobileVertStr =
      `#version 300 es
      layout(location=0) in vec2 aCorner; //in {0,1}x{0,1}

      out vec2 sampleCoords;
      
      void main(void) {
          sampleCoords = aCorner;
          gl_Position = vec4(2.0*aCorner - 1.0, 0.0, 1.0);
      }`;
  
  const addMobileFragStr =
      `#version 300 es
      precision mediump float;

      uniform sampler2D uStaticTexture;
      
      uniform vec2 uMousePos; //in [0,1]x[0,1]
      uniform vec2 uBrushSize; //relative with the canvas size
      
      in vec2 sampleCoords;
      
      out vec4 fragColor;

      void main(void) {
          vec2 fromCenter = 2.0 * (sampleCoords - uMousePos) / uBrushSize;
          if (dot(fromCenter, fromCenter) < 1.0) {
              vec2 normal = normalize(fromCenter);
              fragColor = vec4(0.5*normal + 0.5, 0, 1);
          } else {
              fragColor = texture(uStaticTexture, sampleCoords);
          }
      }`;

  const drawVertStr =
      `#version 300 es
      layout(location=0) in vec2 aCorner; //in {0,1}x{0,1}

      out vec2 sampleCoords;
      
      void main(void) {
          sampleCoords = aCorner;
          gl_Position = vec4(2.0*aCorner - 1.0, 0.0, 1.0);
      }`;

  const drawFragStr =
      `#version 300 es
      precision mediump float;

      uniform sampler2D uObstaclesBuffer;
      uniform bool uDisplayNormals;
      
      in vec2 sampleCoords;
      
      out vec4 fragColor;

      void main(void) {
          vec4 texel = texture(uObstaclesBuffer, sampleCoords);
          vec2 normal = 2.0 * texel.rg - 1.0;
          
          if (dot(normal, normal) < 0.1)
              discard;
          
          if (uDisplayNormals)
              fragColor = vec4(texel.rg, 0, 1);
          else
              fragColor = vec4(0.6, 0.6, 0.6, 1);
      }`;

  /* Public static methods */
  let visible = {
    getAddStaticShader: function(gl) {
      return Shader.fromString(gl, addStaticVertStr, addStaticFragStr);
    },
    
    getAddMobileShader: function(gl) {
      return Shader.fromString(gl, addMobileVertStr, addMobileFragStr);
    },
    
    getDrawShader: function(gl) {
      return Shader.fromString(gl, drawVertStr, drawFragStr);
    }
  };
  
  return Object.freeze(visible);
})();


/**
 * Class for handling obstacles.
 * Obstacles are stored in the red and green channels of a texture.
 * Each pixel stores the normal of the local obstacle.
 * Normals can be retrieved by computing 2*texel.rg - 1.
 * If this value is close to 0 then there is no obstacle on this pixel.
 *
 * The map is made of two parts: static obstacles, and a mobile obstacle.
 */
class ObstacleMap {
  /**
   * 
   * @param {WebGLRenderingContext} gl
   */
  constructor(gl) {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    
    this._staticTexture = ObstacleMap.initTexture(gl, width, height);
    this._texture = ObstacleMap.initTexture(gl, width, height);
         
    this._cornersVBO = VBO.createQuad(gl, 0, 0, 1, 1);
    this._cornersVAO = gl.createVertexArray();
    gl.bindVertexArray(this._cornersVAO);
    gl.enableVertexAttribArray(0);  //corners attribute loc
    gl.bindBuffer(gl.ARRAY_BUFFER, this._cornersVBO.data);
    gl.vertexAttribPointer(0, this._cornersVBO.size, this._cornersVBO.type, false, 0, 0);
    gl.bindVertexArray(null);

    this._drawShader = ObstacleMapShaders.getDrawShader(gl);
    this._drawShader.u["uObstaclesBuffer"].value = this._texture;
        
    this._addMobileShader = ObstacleMapShaders.getAddMobileShader(gl);
    this._addMobileShader.u["uStaticTexture"].value = this._staticTexture;
    
    this._addStaticShader = ObstacleMapShaders.getAddStaticShader(gl);
        
    this._FBO = FBO.create(gl, width, height);

    this.displayNormals = false;
    
    this.brushSize = [100 / width, 100 / height];
    this.addStaticObstacle(gl, 0.5, 0.8);

    this.brushSize = [50 / width, 50 / height];
    this.addStaticObstacle(gl, 0.63, 0.6);

    this.brushSize = [30 / width, 30 / height];
    this.addStaticObstacle(gl, 0.2, 0.5);
  }

  /**
   * @param {object} value array [width,height] of the size of the brush,
   *                 normalized with the map's size.
  */
  set brushSize(value) {
    this._addStaticShader.u["uBrushSize"].value = value;
    this._addMobileShader.u["uBrushSize"].value = value;
  }

  /**
   * @param {boolean} value
  */
  set displayNormals(value) {
    this._drawShader.u["uDisplayNormals"].value = value;
  }
  
  get texture() {
    return this._texture;
  }

  /**
   * 
   * @param {WebGLRenderingContext} gl
   */
  reset(gl) {
    this._staticTexture = ObstacleMap.initTexture(gl, this._FBO.width, this._FBO.height);
    this._addMobileShader.u["uStaticTexture"].value = this._staticTexture;
    
    this._texture = ObstacleMap.initTexture(gl, this._FBO.width, this._FBO.height);
    this._drawShader.u["uObstaclesBuffer"].value = this.texture;
  }

  /**
   * @param {WebGLRenderingContext} gl
   * @param {number} mousePosX in [0,1]
   * @param {number} mousePosY in [0,1]
   */
  setMobileObstacle(gl, mousePosX, mousePosY) {    
    this._addMobileShader.u["uMousePos"].value = [mousePosX, mousePosY];
    
    this._FBO.bind(gl, this._texture, null);
    
    gl.useProgram(this._addMobileShader);
    this._addMobileShader.bindUniforms(gl);
    gl.bindVertexArray(this._cornersVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * @param {WebGLRenderingContext} gl
   * @param {number} mousePosX in [0,1]
   * @param {number} mousePosY in [0,1]
   */
  addStaticObstacle(gl, mousePosX, mousePosY) {    
    this._addStaticShader.u["uMousePos"].value = [mousePosX, mousePosY];
    
    this._FBO.bind(gl, this._staticTexture, null);
    
    gl.useProgram(this._addStaticShader);    
    this._addStaticShader.bindUniforms(gl);
    gl.bindVertexArray(this._cornersVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    this.setMobileObstacle(gl, mousePosX, mousePosY);
  }
  
  draw(gl) {
    gl.useProgram(this._drawShader);    
    this._drawShader.bindUniforms(gl);
    gl.bindVertexArray(this._cornersVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * Initializes a texture with 0 velocity.
   * @param {WebGLRenderingContext} gl
   * @param {number} width
   * @param {number} height
   * @returns {WebGLTexture}
   */
  static initTexture(gl, width, height) {
    let texelData = [];
    let value = [127, 127];
    for (let i = 0 ; i < width * height ; ++i) {
      texelData.push.apply(texelData, value);
    }
    
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, width, height, 0,
    gl.RG, gl.UNSIGNED_BYTE, new Uint8Array(texelData));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
}