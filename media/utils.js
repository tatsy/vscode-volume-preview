function basename(url) {
  var name = url.split("").reverse().join("");
  name = /([^\/]*)/.exec(name);
  name = name[1].split("").reverse().join("");
  return name;
}

function extname(url) {
  return url.split(".").pop().toLowerCase();
}

function isMeshSupport(fileToLoad) {
  switch (extname(fileToLoad)) {
    case "stl":
      return true;
    case "off":
      return true;
    case "ply":
      return true;
    case "xyz":
      return false;
    case "pcd":
      return false;
    default:
      return true;
  }
}

function createModelLoader(fileToLoad) {
  switch (extname(fileToLoad)) {
    case "nrrd":
      return new THREE.NRRDLoader();
    default:
      return new THREE.NRRDLoader();
  }
}

function getBBoxCenter(geometry) {
  geometry.computeBoundingBox();

  var center = new THREE.Vector3();
  center.x = (geometry.boundingBox.max.x + geometry.boundingBox.min.x) / 2;
  center.y = (geometry.boundingBox.max.y + geometry.boundingBox.min.y) / 2;
  center.z = (geometry.boundingBox.max.z + geometry.boundingBox.min.z) / 2;
  return center;
}

function getBBoxMaxExtent(geometry) {
  geometry.computeBoundingBox();

  var cx = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
  var cy = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
  var cz = geometry.boundingBox.max.z - geometry.boundingBox.min.z;

  return Math.max(cx, Math.max(cy, cz));
}

function autoCameraPos(geometry) {
  geometry.computeBoundingBox();

  var cx = (geometry.boundingBox.max.x - geometry.boundingBox.min.x) / 2;
  var cy = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2;
  var cz = (geometry.boundingBox.max.z - geometry.boundingBox.min.z) / 2;
  var sx = cx > 0 ? 1.0 : -1.0;
  var sy = cy > 0 ? 1.0 : -1.0;
  var sz = cz > 0 ? 1.0 : -1.0;
  var d = Math.max(cx, Math.max(cy, cz)) * 2.0;

  var center = getBBoxCenter(geometry);
  var cameraPos = new THREE.Vector3(d * sx, d * sy, d * sz);
  cameraPos.add(center);
  cameraPos.multiplyScalar(1);

  return cameraPos;
}
