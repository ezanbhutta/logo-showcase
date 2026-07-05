const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ webPreferences: { webSecurity: false, nodeIntegration: true } });
  win.loadURL(`data:text/html,<script>
    fetch('file://${__dirname}/web/demo/portfolio/manifest.json')
      .then(res => res.text())
      .then(text => console.log("FETCH SUCCESS:", text.slice(0,20)))
      .catch(e => console.error("FETCH ERROR:", e.message));
  </script>`);
  win.webContents.on('console-message', (e, level, msg) => {
    console.log("CONSOLE:", msg);
    app.quit();
  });
});
