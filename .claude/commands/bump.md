Bump the version in package.json.

Argument: $ARGUMENTS (must be "major", "minor", or "patch")

Steps:

1. Read the current version from package.json
2. Parse the version string (format: major.minor.patch)
3. Based on the argument:
   - "major": increment major, reset minor and patch to 0
   - "minor": increment minor, reset patch to 0
   - "patch": increment patch
4. Update package.json with the new version
5. Report the version change (e.g., "Bumped version: 0.20.3 → 0.21.0")

If no argument or invalid argument is provided, show an error message listing valid options.
