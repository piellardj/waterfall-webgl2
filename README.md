# waterfall-webgl2
A WebGL 2 waterfall simulation from a simple particles system.

Live version [here](https://piellardj.github.io/waterfall-webgl2/).

This is a WebGL 2 port of my WebGL project [Waterfall](https://github.com/piellardj/waterfall-webgl).

The main changes include:
* WebGL 2 transform feedback feature is now used to update the particles' positions and velocities at once. The code is simpler, but there is one downside: since transform feedback only handles 4 bytes types, I now use Float32 precision when 16 bits would be enough. I could however try to pack 2 particles into a Uint32 and extract it in the shaders.
* all shaders are now in version GLSL 300 ES
* since WebGL 2 handles more texture formats, the obstacle map is now a RG8 texture
* VAOs are now always used
* the derivative functionnality is now standard so no need to check for extension support
