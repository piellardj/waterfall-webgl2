"use strict";

/**
 * Module used for binding HTML inputs with the Javascript objects of
 * the simulation.
 */
var Controls = (function(){
  /* Private static attributes */

  /* Private static methods */
  function bindInput(element, func, input) {
    element.addEventListener(input, func, false);
    func();
  }
  
  function bindRenderingSection(gl, particles, fluidify) {
    const pointSizeSlider = document.getElementById("point-size-slider");
    const updatePointSize = () => { particles.pointSize = pointSizeSlider.value; };
    bindInput(pointSizeSlider, updatePointSize, "input");
    
    const blurSlider = document.getElementById("blur-slider");
    const updateBlur = () => { fluidify.setKernelSize(gl, blurSlider.value); };
    bindInput(blurSlider, updateBlur, "input");
    
    const blurThresholdSlider = document.getElementById("blur-threshold-slider");
    const updateThreshold = () => { fluidify.threshold = blurThresholdSlider.value; };
    bindInput(blurThresholdSlider, updateThreshold, "input");
    
    const waterNormalsCheckbox = document.getElementById("water-normals-checkbox");
    const setWaterNormals = () => { fluidify.showNormals = waterNormalsCheckbox.checked; };
    bindInput(waterNormalsCheckbox, setWaterNormals, "change");
    
    const specularCheckbox = document.getElementById("specular-checkbox");
    const updateSpecular = () => { fluidify.specular = specularCheckbox.checked; };
    bindInput(specularCheckbox, updateSpecular, "change");
  }

  function bindParticlesSection(gl, particles) {
    const sizes = [16 * 16,
                   32 * 32,
                   64 * 64,
                   128 * 128,
                   256 * 256,
                   512 * 512,
                   512 * 1024,
                   1024 * 1024,
                   1024 * 2048,
                   2048 * 2048,];
   
    const amountSlider = document.getElementById("amount-slider");
    const updateAmount = function() {
      const size = sizes[amountSlider.value];
      particles.reset(gl, size);
      
      let nbParticlesText = document.getElementById("nb-particles-text");
      nbParticlesText.textContent = particles.nbParticles;
    }
    bindInput(amountSlider, updateAmount, "change");
    
    const gravitySlider = document.getElementById("gravity-slider");
    const updateGravity = () => { particles.acceleration =[0, -gravitySlider.value]; };
    bindInput(gravitySlider, updateGravity, "input");
    
    const speedSlider = document.getElementById("speed-slider");
    const updateSpeed = () => { particles.speed = speedSlider.value; };
    bindInput(speedSlider, updateSpeed, "input");
  }

  function bindObstaclesSection(gl, canvas, obstacles) {
    const resetButton = document.getElementById("reset-button");
    resetButton.addEventListener("click", () => { obstacles.reset(gl), false; });
    
    const brushSizeSlider = document.getElementById("brushsize-slider");
    const updateBrushSize = function() {
      const value = brushSizeSlider.value;
      obstacles.brushSize = [value / canvas.clientWidth,
        value / canvas.clientHeight];
    }
    bindInput(brushSizeSlider, updateBrushSize, "input");
    
    const displayNormalsCheckbox = document.getElementById("display-normals-checkbox");
    const updateNormals = () => { obstacles.displayNormals = displayNormalsCheckbox.checked; };
    bindInput(displayNormalsCheckbox, updateNormals, "change");
  }

  function bindMouse(gl, canvas, obstacles) {
    function documentToCanvas(vec) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: vec.x - rect.left,
        y: canvas.clientHeight - (vec.y - rect.top)
      };
    }
    
    function mouseMove(event) {
      let pos = { x: event.clientX, y: event.clientY };
      pos = documentToCanvas(pos);
      pos.x /= canvas.clientWidth;
      pos.y /= canvas.clientHeight;
        
      obstacles.setMobileObstacle(gl, pos.x, pos.y);
      if (isMouseDown) {
        obstacles.addStaticObstacle(gl, pos.x, pos.y);
      }
    }
    
    let isMouseDown = false;
    document.addEventListener("mousemove", mouseMove, false);
    
    canvas.addEventListener("mousedown", function (e) {
      isMouseDown = true;
      mouseMove(event);
    }, false);
    
    document.body.addEventListener("mouseup", function () {
      isMouseDown = false;
    }, false);
  }

  /* Public static methods */
  let visible = {
    setFluidMode: function(bool) {},

    showFluidSection(fluid) {
      const fluidSection = document.getElementById("fluid-controllers");
      
      fluidSection.className = fluidSection.className.replace(/ hidden/g, "");
      if (!fluid) {
        fluidSection.className += " hidden";
      }
    },
    
    bind: function(gl, canvas, particles, obstacles, fluidify) {
      bindRenderingSection(gl, particles, fluidify);
      bindParticlesSection(gl, particles);
      bindObstaclesSection(gl, canvas, obstacles);
      bindMouse(gl, canvas, obstacles);
      
      const particlesButton = document.getElementById("point-mode-button");
      
      const setMode = (fluid) => {
        this.showFluidSection(fluid);
        this.setFluidMode(fluid);
      };
      
      particlesButton.addEventListener("click", () => setMode(false));
      
      const fluidButton = document.getElementById("fluid-mode-button");
      fluidButton.addEventListener("click", () => setMode(true));
    },

    /**
     * For hardware that doesn't support specularity, disables
     * the specular check box.
     */
    disableSpecular: function() {
      const checkbox = document.getElementById("specular-checkbox");
      const label = document.getElementById("specular-label");
      
      checkbox.checked = false;
      checkbox.disabled = "disabled";
      label.style.color = "grey";
      label.innerHTML = "not supported";
    }
  };
  
  Object.defineProperty(visible, "bind", {writable: false});
  Object.defineProperty(visible, "disableSpecular", {writable: false});
  Object.preventExtensions(visible);
  Object.seal(visible);
  
  return visible;
  
})();