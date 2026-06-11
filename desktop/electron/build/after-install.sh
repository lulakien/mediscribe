#!/bin/bash
# Post-installation script for MediScribe .deb package
# Ensures ffmpeg is available and provides helpful feedback

set -e

echo "MediScribe installation complete."
echo ""
echo "Checking dependencies..."

if [ -x /opt/MediScribe/mediscribe ]; then
    cat > /usr/bin/mediscribe <<'EOF'
#!/bin/bash
nohup /opt/MediScribe/mediscribe "$@" >/dev/null 2>&1 &
exit 0
EOF
    chmod 755 /usr/bin/mediscribe
fi

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠ Warning: ffmpeg is not installed."
    echo "MediScribe requires ffmpeg for audio processing."
    echo "Install it with: sudo apt install ffmpeg"
    echo ""
fi

# Check if ffprobe is installed
if ! command -v ffprobe &> /dev/null; then
    echo "⚠ Warning: ffprobe is not installed."
    echo "Install it with: sudo apt install ffmpeg"
    echo ""
fi

# Check for NVIDIA driver (optional, for GPU acceleration)
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA driver detected - GPU acceleration available"
else
    echo "ℹ NVIDIA driver not detected - will use CPU transcription"
    echo "For GPU acceleration, install NVIDIA drivers for your GPU"
fi

echo ""
echo "MediScribe is ready to use!"
echo "Launch it from your application menu or run: mediscribe"

exit 0
