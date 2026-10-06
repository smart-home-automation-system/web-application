export interface BuildInfo {
  readonly version: string;
  readonly commit: string;
  /** ISO instant of the build; empty for a local build. */
  readonly builtAt: string;
}

/**
 * What this bundle was built from. The values below are those of a local build; the image
 * build overwrites this file with the release tag and commit (`scripts/stamp-build-info.mjs`).
 */
export const BUILD_INFO: BuildInfo = {
  version: '0.0.0-dev',
  commit: 'local',
  builtAt: '',
};
