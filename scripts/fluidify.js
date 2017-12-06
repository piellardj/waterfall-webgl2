"use strict";

/**
 * Module for storing and building shaders related to the Fluidify class.
 */
const FluidifyShaders = (function() {
  const displayVertStr =
      `#version 300 es
      layout(location=0) in vec2 aCorner; //in {0,1}x{0,1}

      out vec2 sampleCoords;
      
      void main(void)
      {
          sampleCoords = aCorner;
          gl_Position = vec4(2.0*aCorner - 1.0, 0.0, 1.0);
      }`;

  const displayFragStr =
      `#version 300 es
      precision mediump float;

      uniform sampler2D uTexture;
      uniform float uThreshold;
      uniform bool uShowNormals;
      uniform bool uSpecular;
      
      in vec2 sampleCoords;
      
      out vec4 fragColor;

      void main(void)
      {
          vec4 texel = texture(uTexture, sampleCoords);
          
          float visible = step(uThreshold, texel.a);
          float level = visible * texel.a;
          
          vec4 color = texel;

          vec3 n = cross(vec3(1.0 / 512.0, 0, dFdx(level)), vec3(0, 1.0/512.0, dFdy(level)));
          n = normalize(n);
            
          if (uShowNormals)
              color = vec4(0.5*n+.5,1);
          
          const vec3 lightDir = vec3(0.73, 0.73, -0.73);//normalize(-vec3(1, 1, 1));
            
          const vec4 specularColor = vec4(1, 1, 1, 0);
          const float k = 0.1;
            
          float specularFactor = smoothstep(0.99, 1.0, dot(n, lightDir));
          vec4 specular = pow(specularFactor, k) * specularColor;

          if (!uSpecular)
            specular = vec4(0);
          
          fragColor = visible * (color + specular);
      }`;
        
  const blurVertStr =
      `#version 300 es
      layout(location=0) in vec2 aCorner; //in {0,1}x{0,1}

      out vec2 sampleCoords;
      
      void main(void)
      {
          sampleCoords = aCorner;
          gl_Position = vec4(2.0*aCorner - 1.0, 0.0, 1.0);
      }`;
    
  const blurFragRawStr =
      `#version 300 es
      precision mediump float;

      uniform sampler2D uTexture;
      uniform vec2 uStep;
      uniform float uKernel[___KERNEL_SIZE___];
      
      in vec2 sampleCoords;
      
      out vec4 fragColor;

      void main(void)
      {
          vec4 result = vec4(0);
          
          vec2 coords = sampleCoords - float(___KERNEL_SIZE___ / 2) * uStep;
          for (int i = 0 ; i < ___KERNEL_SIZE___; ++i) {
              result += uKernel[i] * texture(uTexture, coords);
              coords += uStep;
          }
          
          fragColor = result;
      }`;
  
  let blurFragStr;
  
  function setKernelSize(kernelSize) {
    blurFragStr = blurFragRawStr.replace(/___KERNEL_SIZE___/g, kernelSize);
  }
  
  let visible = {    
    getBlurShader: function(gl, kernelSize) {
      setKernelSize(kernelSize);
      return Shader.fromString(gl, blurVertStr, blurFragStr);
    },
    
    getDisplayShader: function(gl) {
      return Shader.fromString(gl, displayVertStr, displayFragStr);
    },
    
  };
  
  return Object.freeze(visible);
})();


/**
 * Class for making the particles look like a fluid.
 * To do so it performs a Gaussian blur then a thresholding.
 */
class Fluidify {
  constructor(gl) {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    
    this._rawTex = Fluidify.initTexture(gl, width, height);
    this._halfBlurredTex = Fluidify.initTexture(gl, width, height);
    this._blurredTex = Fluidify.initTexture(gl, width, height);
    
    this._depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    
    this._FBO = FBO.create(gl, width, height, true);
    
    this._cornersVBO = VBO.createQuad(gl, 0, 0, 1, 1);
    this._cornersVAO = gl.createVertexArray();
    gl.bindVertexArray(this._cornersVAO);
    gl.enableVertexAttribArray(0);  //corners attribute loc
    gl.bindBuffer(gl.ARRAY_BUFFER, this._cornersVBO.data);
    gl.vertexAttribPointer(0, this._cornersVBO.size, this._cornersVBO.type, false, 0, 0);
    gl.bindVertexArray(null);

    this._displayShader = FluidifyShaders.getDisplayShader(gl);
    this._displayShader.u["uTexture"].value = this._blurredTex;

    this._blurShader = FluidifyShaders.getBlurShader(gl, 1);
    this.setKernelSize(gl, 9); 
         
    this.threshold = 0.5;
    this.solidColor = true;
    this.showNormals = false;
    this.specular = true;
  }

  /**
   * @param {boolean} value
  */
  set showNormals(value) {
    if (typeof this._displayShader.u["uShowNormals"] !== typeof undefined) {
      this._displayShader.u["uShowNormals"].value = value;
    }
  }

  /**
   * @param {number} value
  */
  set threshold(value) {
    this._displayShader.u["uThreshold"].value = value;
  }

  /**
   * @param {boolean} value
  */
  set specular(value) {
    if (typeof this._displayShader.u["uSpecular"] !== typeof undefined) {
      this._displayShader.u["uSpecular"].value = value;
    }
  }
  
  setKernelSize(gl, kernelSize) {
    this._blurShader = FluidifyShaders.getBlurShader(gl, kernelSize);
    
    const kernelFunction = (x) => { return Math.exp(-4*x*x); };
    
    let total = 0;
    let kernel = [];
    for (let i = 0; i < kernelSize; ++i) {
      let x = 2 * i / kernelSize - 1; //normalized in [-1,1], centered on kernelSize/2
      kernel.push(kernelFunction(x));
      total += kernel[i];
    }
    for (let i = 0; i < kernelSize; ++i) {
      kernel[i] /= total;
    }
    
    this._blurShader.u["uKernel[0]"].value = kernel;
  }
  
  bindFBO(gl) {
    this._FBO.bind(gl, this._rawTex, this._depthBuffer);
  }

  /**
   * Processes the raw particles render to make it look like fluid.
   * The result can later be accessed with the draw method.
   * @param {WebGLRenderingContext} gl
   */
  process(gl) {
    gl.useProgram(this._blurShader);
    gl.bindVertexArray(this._cornersVAO);

    /* Horizontal blur */
    this._blurShader.u["uTexture"].value = this._rawTex;
    this._blurShader.u["uStep"].value = [1 / this._FBO.width, 0];
    
    this._FBO.bind(gl, this._halfBlurredTex, null);
    this._blurShader.bindUniforms(gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    /* Vertical blur */
    this._blurShader.u["uTexture"].value = this._halfBlurredTex;
    this._blurShader.u["uStep"].value = [0, 1 / this._FBO.height];
    
    this._FBO.bind(gl, this._blurredTex, null);
    this._blurShader.bindUniforms(gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
  }

  /**
   * Displays the processed particles render.
  * If the process method was not called before, the result
  * might be black.
   * @param {WebGLRenderingContext} gl
   */
  draw(gl) {
    gl.useProgram(this._displayShader);
    this._displayShader.bindUniforms(gl);
    gl.bindVertexArray(this._cornersVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  
  static initTexture(gl, width, height) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }
}
