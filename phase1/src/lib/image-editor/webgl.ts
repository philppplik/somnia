import type { RasterImage } from './pipeline';
const VERTEX = `#version 300 es
in vec2 aPos; out vec2 vUv; uniform bool uFlipY;
void main(){vUv=aPos*0.5+0.5;if(uFlipY)vUv.y=1.0-vUv.y;gl_Position=vec4(aPos,0.0,1.0);}`;
const COPY = `#version 300 es
precision highp float; uniform sampler2D uTex; in vec2 vUv; out vec4 outColor;
void main(){outColor=texture(uTex,vUv);}`;
/** Own canvas: never claim WebGL on the same canvas already used by a 2D renderer. */
export class ImageGpuRenderer {
  private gl: WebGL2RenderingContext;
  private lost = false;
  private disposed = false;
  private programs = new Map<string,WebGLProgram>();
  private buffer: WebGLBuffer;
  private onLost = (event: Event) => { event.preventDefault(); this.lost = true; this.programs.clear(); this.onCapabilityChange?.(false); };
  private onRestored = () => { this.lost = false; this.buffer = this.makeBuffer(); this.onCapabilityChange?.(true); };
  constructor(readonly canvas: HTMLCanvasElement, private onCapabilityChange?: (available:boolean) => void) {
    const gl = canvas.getContext('webgl2', {alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});
    if (!gl) throw new Error('WebGL2 is unavailable.');
    this.gl = gl; this.buffer = this.makeBuffer();
    canvas.addEventListener('webglcontextlost',this.onLost); canvas.addEventListener('webglcontextrestored',this.onRestored);
  }
  get available(): boolean { return !this.lost && !this.disposed && !this.gl.isContextLost(); }
  get maxTextureSize(): number { return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number; }
  private makeBuffer(): WebGLBuffer {
    const gl = this.gl, buffer = gl.createBuffer(); if (!buffer) throw new Error('GPU buffer allocation failed.');
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW); return buffer;
  }
  private program(fragment: string): WebGLProgram {
    const existing = this.programs.get(fragment); if (existing) return existing;
    const gl = this.gl;
    const compile = (type:number, text:string) => {
      const shader = gl.createShader(type); if (!shader) throw new Error('Shader allocation failed.');
      gl.shaderSource(shader,text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`Image shader failed: ${error}`); } return shader;
    };
    const vert = compile(gl.VERTEX_SHADER,VERTEX);
    let frag:WebGLShader;
    try { frag=compile(gl.FRAGMENT_SHADER,fragment); } catch(error) {gl.deleteShader(vert);throw error;}
    const program = gl.createProgram(); if (!program) {gl.deleteShader(vert);gl.deleteShader(frag);throw new Error('GPU program allocation failed.');}
    gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);gl.deleteShader(vert);gl.deleteShader(frag);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) { const error=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(`Image shader link failed: ${error}`); }
    if(this.programs.size>=32){const [key,old]=this.programs.entries().next().value!;gl.deleteProgram(old);this.programs.delete(key);}
    this.programs.set(fragment,program); return program;
  }
  /** Capability is proven by texture upload and a draw, not just getContext. Ping-pong passes avoid readbacks. */
  render(source: RasterImage, fragments: readonly string[] = []): HTMLCanvasElement {
    if (!this.available) throw new Error('GPU context unavailable.');
    if (Math.max(source.width,source.height) > this.maxTextureSize) throw new Error('Image exceeds GPU texture limits.');
    const gl=this.gl, textures:WebGLTexture[]=[], framebuffers:WebGLFramebuffer[]=[];
    this.canvas.width=source.width; this.canvas.height=source.height;
    gl.viewport(0,0,source.width,source.height); gl.disable(gl.BLEND); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    try {
      for(let i=0;i<2;i++) {
        const texture=gl.createTexture();if(!texture)throw new Error('GPU texture allocation failed.');textures.push(texture);
        gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,i===0?source.data:null);
        const fb=gl.createFramebuffer();if(!fb)throw new Error('GPU framebuffer allocation failed.');framebuffers.push(fb);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('GPU framebuffer is incomplete.');
      }
      let read=0;
      for(const [i,fragment] of [...fragments,COPY].entries()) {
        const final=i===fragments.length, program=this.program(fragment);
        gl.bindFramebuffer(gl.FRAMEBUFFER,final?null:framebuffers[1-read]);gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'uFlipY'),final?1:0);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
        const pos=gl.getAttribLocation(program,'aPos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[read]);gl.uniform1i(gl.getUniformLocation(program,'uTex'),0);gl.uniform2f(gl.getUniformLocation(program,'uSize'),source.width,source.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(!final)read=1-read;
      }
      if(gl.getError()!==gl.NO_ERROR)throw new Error('GPU render failed.');return this.canvas;
    } finally {gl.bindFramebuffer(gl.FRAMEBUFFER,null);textures.forEach(t=>gl.deleteTexture(t));framebuffers.forEach(f=>gl.deleteFramebuffer(f));}
  }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;
    this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);
    this.programs.forEach(p=>this.gl.deleteProgram(p));this.programs.clear();this.gl.deleteBuffer(this.buffer);
  }
}
