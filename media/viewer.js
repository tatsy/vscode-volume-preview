import * as THREE from "three";
import * as dat from "./three/dat.gui.module.js";
import { Stats } from "./three/stats.module.js";
import { NRRDLoader } from "./three/loaders/NRRDLoader.js";
import { TrackballControls } from "./three/controls/TrackballControls.js";
import { VolumeRenderShader1 } from "./three/shaders/VolumeShader.js";

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
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2,
      window.innerWidth / 2,
      window.innerHeight / 2,
      -window.innerHeight / 2,
      1.0,
      5000.0
    );
    this.volumeSize = { x: 0, y: 0, z: 0 };

    // shader
    const shader = VolumeRenderShader1;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    this.material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.DoubleSide,
    });
    console.log(this.material.uniforms);

    // volume config
    this.volumeConfig = {
      clim1: 0,
      clim2: 1,
      renderstyle: "iso",
      isothreshold: 0.15,
      colormap: "viridis",
    };

    // colormap textures
    this.cmapTextures = {
      viridis: new THREE.TextureLoader().load("three/textures/cm_viridis.png"),
      gray: new THREE.TextureLoader().load("three/textures/cm_gray.png"),
    };

    this.stats = new Stats();
    this.stats.showPanel(0);
    this.gridHelper = null;
    this.axisHelper = null;

    this.gui = new dat.GUI();
    this.gui.add(this.volumeConfig, "clim1", 0, 1, 0.01);
    this.gui.add(this.volumeConfig, "clim2", 0, 1, 0.01);
    this.gui.add(this.volumeConfig, "colormap", {
      gray: "gray",
      viridis: "viridis",
    });
    this.gui.add(this.volumeConfig, "renderstyle", { mip: "mip", iso: "iso" });
    this.gui.add(this.volumeConfig, "isothreshold", 0, 1, 0.01);

    // Parameters
    this.params = JSON.parse(
      document
        .getElementById("vscode-volume-data")
        .getAttribute("data-settings")
    );

    // GUI
    this.initRenderer();
    this.initScene();
    this.initLight();

    // load volume
    this.addVolume(this.params.fileToLoad);

    // add DOM
    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(this.stats.domElement);
    window.addEventListener("resize", this.onWindowResize.bind(this), false);
  }

  initRenderer() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initScene() {
    this.scene.fog = new THREE.FogExp2(
      this.params.backgroundColor,
      this.params.fogDensity
    );
    this.scene.background = new THREE.Color(this.params.backgroundColor);
  }

  initGui() {}

  updateGui() {}

  initCamera() {
    const w = this.volumeSize.x;
    const h = this.volumeSize.y;
    const d = this.volumeSize.z;
    const camTarget = new THREE.Vector3(w / 2, h / 2, d / 2);
    const camPos = new THREE.Vector3(w / 2, h * 1.5, d / 2);

    this.camera.position.copy(camPos);
    this.camera.up.set(0, 0, -1);
    this.controls = new TrackballControls(
      this.camera,
      this.renderer.domElement
    );
    this.controls.target = camTarget;
  }

  initLight() {
    const light = new THREE.HemisphereLight(0x888888, 0x333333, 1.0);
    this.scene.add(light);
  }

  initHelpers() {}

  animate() {
    this.stats.begin();
    requestAnimationFrame(this.animate.bind(this));
    const time = Date.now();
    if (this.lastTime !== time) {
      this.lastTime = time;
      this.updateGui();
    }
    this.updateUniforms();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.stats.end();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateUniforms() {
    this.material.uniforms["u_clim"].value.set(
      this.volumeConfig.clim1,
      this.volumeConfig.clim2
    );
    this.material.uniforms["u_renderstyle"].value =
      this.volumeConfig.renderstyle == "mip" ? 0 : 1; // 0: MIP, 1: ISO
    this.material.uniforms["u_renderthreshold"].value =
      this.volumeConfig.isothreshold; // For ISO renderstyle
    this.material.uniforms["u_cmdata"].value =
      this.cmapTextures[this.volumeConfig.colormap];
  }

  addVolume(fileToLoad) {
    const self = this;
    const loader = new NRRDLoader();
    loader.load(
      fileToLoad,
      function (volume) {
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
        self.material.uniforms["u_data"].value = texture;
        self.material.uniforms["u_size"].value.set(
          volume.xLength,
          volume.yLength,
          volume.zLength
        );
        self.material.uniforms["u_clim"].value.set(
          self.volumeConfig.clim1,
          self.volumeConfig.clim2
        );
        self.material.uniforms["u_renderstyle"].value =
          self.volumeConfig.renderstyle == "mip" ? 0 : 1; // 0: MIP, 1: ISO
        self.material.uniforms["u_renderthreshold"].value =
          self.volumeConfig.isothreshold; // For ISO renderstyle
        self.material.uniforms["u_cmdata"].value =
          self.cmapTextures[self.volumeConfig.colormap];

        // THREE.Mesh
        const geometry = new THREE.BoxGeometry(
          volume.xLength,
          volume.yLength,
          volume.zLength
        );
        geometry.translate(
          volume.xLength / 2 - 0.5,
          volume.yLength / 2 - 0.5,
          volume.zLength / 2 - 0.5
        );

        const mesh = new THREE.Mesh(geometry, self.material);
        self.scene.add(mesh);

        // post initialization
        self.initCamera();
        self.initGui();
        self.initHelpers();
        self.animate();
      }.bind(self)
    );
  }
}

const viewer = new Viewer();
