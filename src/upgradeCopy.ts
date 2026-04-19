export function formatNewerReleaseMessage(latestDisplay: string, currentDisplay: string): string {
  return `Version ${latestDisplay} is available (you have ${currentDisplay}).`;
}

export const CANNOT_CHECK_RELEASE_MESSAGE = "Can't check latest release version.";
