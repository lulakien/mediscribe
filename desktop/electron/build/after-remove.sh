#!/bin/bash
# Post-removal cleanup for MediScribe .deb package

set -e

if [ -e /usr/bin/mediscribe ] || [ -L /usr/bin/mediscribe ]; then
    rm -f /usr/bin/mediscribe
fi

exit 0
