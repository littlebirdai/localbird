#!/bin/bash
# Strip all extended attributes from an app bundle
# Usage: strip-xattrs.sh /path/to/App.app

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
    echo "Usage: $0 /path/to/App.app"
    exit 1
fi

echo "Stripping extended attributes from: $APP_PATH"

# Remove all xattrs recursively
find "$APP_PATH" -print0 | while IFS= read -r -d '' file; do
    xattr -c "$file" 2>/dev/null
done

# Explicitly remove problematic attrs (may have been missed by xattr -c on directories)
attrs=(
    "com.apple.FinderInfo"
    "com.apple.fileprovider.fpfs#P"
    "com.apple.quarantine"
    "com.apple.provenance"
)

for attr in "${attrs[@]}"; do
    find "$APP_PATH" -print0 | while IFS= read -r -d '' file; do
        xattr -d "$attr" "$file" 2>/dev/null
    done
done

# Clean up ._ files
dot_clean -m "$APP_PATH" 2>/dev/null

echo "Done stripping extended attributes"
