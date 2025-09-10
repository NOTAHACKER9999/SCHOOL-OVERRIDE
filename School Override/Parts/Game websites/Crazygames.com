<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrazyGames Overlay</title>
  <style>
    body { margin: 0; font-family: sans-serif; }
    #overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: black;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    #overlay iframe {
      width: 100%; height: 100%;
      border: none;
    }
    #closeBtn {
      position: absolute;
      top: 15px; right: 20px;
      font-size: 28px;
      color: white;
      cursor: pointer;
      z-index: 10000;
      background: rgba(0,0,0,0.6);
      padding: 4px 10px;
      border-radius: 6px;
    }
  </style>
</head>
<body>

<div id="overlay">
  <div id="closeBtn">&times;</div>
  <iframe id="gameFrame"></iframe>
</div>

<script>
  const iframe = document.getElementById('gameFrame');
  const closeBtn = document.getElementById('closeBtn');

  // Replace with your deployed Worker URL (better on a custom domain, not workers.dev)
  const workerURL = "https://crazygamesunblocker.th15isar0bothi.workers.dev/";

  // Auto-load overlay
  window.addEventListener('load', () => {
    iframe.src = workerURL;
    document.getElementById('overlay').style.display = 'flex';
  });

  // Close overlay
  closeBtn.addEventListener('click', () => {
    iframe.src = '';
    document.getElementById('overlay').style.display = 'none';
  });
</script>

</body>
</html>
