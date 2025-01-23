import * as THREE from 'three';
import { GUI } from './three/libs/lil-gui.module.min.js';
import { NRRDLoader } from './three/loaders/NRRDLoader.js';
import { TrackballControls } from './three/controls/TrackballControls.js';
import { VolumeRenderShader1 } from './three/shaders/VolumeShader.js';
import Stats from './three/libs/stats.module.js';

class Viewer {
  renderer;
  scene;
  camera;
  controls;
  material;
  cmapTextures;
  volumeConfig;
  volumeSize;

  constructor() {
    this.volumeSize = { x: 0, y: 0, z: 0 };
    this.gridHelper = null;
    this.axisHelper = null;

    // parameters
    this.params = JSON.parse(
      document.getElementById('vscode-volume-data').getAttribute('data-settings')
    );
    this.params.gridHelper = {
      size: 800,
      unit: 10,
    };

    // renderer
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // stats
    this.stats = new Stats();
    this.stats.showPanel(0);
    document.body.appendChild(this.stats.dom);

    // scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(this.params.backgroundColor, this.params.fogDensity);
    this.scene.background = new THREE.Color(this.params.backgroundColor);

    // camera
    this.camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2,
      window.innerWidth / 2,
      window.innerHeight / 2,
      -window.innerHeight / 2,
      0.0,
      2500.0
    );

    // shader
    const shader = VolumeRenderShader1;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    this.material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide,
    });

    // volume config
    this.volumeConfig = {
      clim1: 0,
      clim2: 1,
      renderstyle: this.params.defaultRenderStyle,
      isothreshold: 0.15,
      colormap: this.params.defaultColorMap,
    };

    // colormap textures
    this.cmapTextures = {
      gray: new THREE.TextureLoader().load('three/textures/cm_gray.png'),
      viridis: new THREE.TextureLoader().load('three/textures/cm_viridis.png'),
      magma: new THREE.TextureLoader().load('three/textures/cm_magma.png'),
      inferno: new THREE.TextureLoader().load('three/textures/cm_inferno.png'),
      plasma: new THREE.TextureLoader().load('three/textures/cm_plasma.png'),
      cividis: new THREE.TextureLoader().load('three/textures/cm_cividis.png'),
    };

    // GUI
    this.gui = new GUI();

    const renderFolder = this.gui.addFolder('Rendering');
    renderFolder.open();
    renderFolder
      .add(this.volumeConfig, 'clim1', 0, 1, 0.01)
      .name('color limit[0]')
      .onChange(() => this.updateUniforms());
    renderFolder
      .add(this.volumeConfig, 'clim2', 0, 1, 0.01)
      .name('color limit[1]')
      .onChange(() => this.updateUniforms());
    renderFolder
      .add(this.volumeConfig, 'colormap', {
        gray: 'gray',
        viridis: 'viridis',
        inferno: 'inferno',
        plasma: 'plasma',
        magma: 'magma',
        cividis: 'cividis',
      })
      .onChange(() => this.updateUniforms());
    renderFolder
      .add(this.volumeConfig, 'renderstyle', {
        mip: 'mip',
        iso: 'iso',
      })
      .onChange(() => this.updateUniforms());
    renderFolder
      .add(this.volumeConfig, 'isothreshold', 0, 1, 0.01)
      .onChange(() => this.updateUniforms());

    const helperFolder = this.gui.addFolder('Helpers');
    helperFolder.open();
    helperFolder
      .add(this.params, 'showAxesHelper')
      .name('show axes helper')
      .onChange(() => this.updateHelpers());
    helperFolder
      .add(this.params, 'showGridHelper')
      .name('show grid helper')
      .onChange(() => this.updateHelpers());
    helperFolder
      .add(this.params.gridHelper, 'size')
      .name('size')
      .onChange(() => this.updateHelpers());
    helperFolder
      .add(this.params.gridHelper, 'unit')
      .name('unit')
      .onChange(() => this.updateHelpers());

    // add components to DOM
    document.body.appendChild(this.renderer.domElement);
    window.addEventListener('resize', this.onWindowResize.bind(this), false);

    // load volume
    this.setVolume(this.params.fileToLoad);
  }

  updateHelpers() {
    // Remove current helpers
    if (this.gridHelper !== null) {
      this.scene.remove(this.gridHelper);
    }

    if (this.axesHelper !== null) {
      this.scene.remove(this.axesHelper);
    }

    // Grid helper
    if (this.params.showGridHelper) {
      const size = this.params.gridHelper.size;
      const unit = this.params.gridHelper.unit;
      const divisions = size / unit;
      if (
        this.gridHelper === null ||
        this.gridHelper.size !== size ||
        this.gridHelper.divisions !== divisions
      ) {
        const colorCenterLine = new THREE.Color('#888888');
        const colorGrid = new THREE.Color('#888888');
        this.gridHelper = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
        this.gridHelper.position.x += this.volumeSize.x * 0.5;
        this.gridHelper.position.y += this.volumeSize.y * 0.5;
        this.gridHelper.position.z += this.volumeSize.z * 0.5;
        this.gridHelper.material.linewidth = 10;
        this.gridHelper.name = 'gridHelper';
      }

      this.scene.add(this.gridHelper);
    }

    // Axis helper
    if (this.params.showAxesHelper) {
      const minValue = Math.min(this.volumeSize.x, this.volumeSize.y, this.volumeSize.z);

      if (this.axisHelper === null) {
        this.axesHelper = new THREE.AxesHelper(minValue);
        this.axesHelper.scale.set(1, 1, -1);
        this.axesHelper.position.x += this.volumeSize.x * 0.5;
        this.axesHelper.position.y += this.volumeSize.y * 0.5;
        this.axesHelper.position.z += this.volumeSize.z * 0.5;
        this.axesHelper.material.linewidth = 10;
        this.axesHelper.name = 'axesHelper';
      }

      this.scene.add(this.axesHelper);
    }
  }

  mainloop() {
    this.stats.begin();
    requestAnimationFrame(this.mainloop.bind(this));
    this.renderer.render(this.scene, this.camera);
    this.controls.update();
    this.stats.end();
  }

  onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumHeight = this.camera.top - this.camera.bottom;
    this.camera.left = (-frustumHeight * aspect) / 2;
    this.camera.right = (frustumHeight * aspect) / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateCamera() {
    const w = this.volumeSize.x;
    const h = this.volumeSize.y;
    const d = this.volumeSize.z;
    const camTarget = new THREE.Vector3(w / 2, h / 2, d / 2);
    const camPos = new THREE.Vector3(w * 1.5, h * 1.5, -d * 1.0);

    this.camera.position.copy(camPos);
    this.camera.up.set(0, 0, -1);
    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 2.0;
    this.controls.target = camTarget;
  }

  updateUniforms() {
    this.material.uniforms['u_clim'].value.set(this.volumeConfig.clim1, this.volumeConfig.clim2);
    this.material.uniforms['u_renderstyle'].value = this.volumeConfig.renderstyle == 'mip' ? 0 : 1; // 0: MIP, 1: ISO
    this.material.uniforms['u_renderthreshold'].value = this.volumeConfig.isothreshold; // For ISO renderstyle
    this.material.uniforms['u_cmdata'].value = this.cmapTextures[this.volumeConfig.colormap];
  }

  setVolume(fileToLoad) {
    const self = this;
    const loader = new NRRDLoader();
    loader.load(fileToLoad, function (volume) {
      // normalize volume values
      var minValue = 1.0e20;
      var maxValue = -1.0e20;
      for (var i = 0; i < volume.data.length; i++) {
        const value = volume.data[i];
        minValue = Math.min(value, minValue);
        maxValue = Math.max(value, maxValue);
      }

      const valueRange = maxValue - minValue;
      for (var i = 0; i < volume.data.length; i++) {
        volume.data[i] = (volume.data[i] - minValue) / valueRange;
      }
      self.volumeSize = {
        x: volume.xLength,
        y: volume.yLength,
        z: volume.zLength,
      };

      // create 3D texture
      const texture = new THREE.Data3DTexture(
        volume.data,
        volume.xLength,
        volume.yLength,
        volume.zLength
      );
      texture.format = THREE.RedFormat;
      texture.type = THREE.FloatType;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;

      // Material
      self.material.uniforms['u_data'].value = texture;
      self.material.uniforms['u_size'].value.set(volume.xLength, volume.yLength, volume.zLength);
      self.material.uniforms['u_clim'].value.set(self.volumeConfig.clim1, self.volumeConfig.clim2);
      self.material.uniforms['u_renderstyle'].value =
        self.volumeConfig.renderstyle == 'mip' ? 0 : 1; // 0: MIP, 1: ISO
      self.material.uniforms['u_renderthreshold'].value = self.volumeConfig.isothreshold; // For ISO renderstyle
      self.material.uniforms['u_cmdata'].value = self.cmapTextures[self.volumeConfig.colormap];

      // THREE.Mesh
      const geometry = new THREE.BoxGeometry(volume.xLength, volume.yLength, volume.zLength);
      geometry.translate(
        volume.xLength / 2 - 0.5,
        volume.yLength / 2 - 0.5,
        volume.zLength / 2 - 0.5
      );

      const mesh = new THREE.Mesh(geometry, self.material);
      self.scene.add(mesh);

      // rendering
      self.updateCamera();
      self.updateHelpers();
      self.mainloop();
    });
  }
}

const viewer = new Viewer();
