document.getElementById('grantBtn').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop immediately, we just needed the permission grant
        stream.getTracks().forEach(track => track.stop());

        document.getElementById('grantBtn').style.display = 'none';
        document.getElementById('successMsg').style.display = 'block';

        // Optional: Auto close after 2 seconds
        setTimeout(() => {
            window.close();
        }, 2000);
    } catch (err) {
        alert("Error requesting permission: " + err.message);
    }
});
