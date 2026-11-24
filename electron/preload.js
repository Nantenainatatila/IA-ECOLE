const { contextBridge } = require('electron');

// Informations minimales exposées à l'interface React (aucun accès Node direct).
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
});
