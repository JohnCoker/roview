import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getName, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Link,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  tokens,
} from "@fluentui/react-components";
import type { MenuOpenChangeData, MenuOpenEvent } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";
import { PRODUCT_HOMEPAGE } from "./productSite";

type BarMenuId = "file" | "view" | "help";

/** Slightly larger than `size="small"` body (Base200); still Fluent type ramp. */
const menubarTriggerStyle = {
  fontSize: tokens.fontSizeBase300,
  lineHeight: tokens.lineHeightBase300,
  minWidth: 0,
  alignSelf: "stretch",
  borderRadius: 0,
  paddingLeft: tokens.spacingHorizontalM,
  paddingRight: tokens.spacingHorizontalM,
  paddingTop: 0,
  paddingBottom: 0,
} satisfies CSSProperties;

/** Matches `ABOUT_INTRO` in `src-tauri/src/lib.rs` (AboutMetadata.comments). */
const ABOUT_INTRO =
  "Desktop app for exploring time-series CSV output produced by RASOrbit.";

export function isWindowsPlatform(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

export interface WindowsAppMenuBarProps {
  theme: Theme;
  /** When a CSV is loaded and the main view is interactive. */
  viewCommandsEnabled: boolean;
  /** Mirrors native menu: charts selected. */
  exportEnabled: boolean;
  /** Map Trace row is available. */
  locationEnabled: boolean;
  /** Globe Trace row is available (location + altitude). */
  globeEnabled: boolean;
  /** Refetch Open Recent when this changes (e.g. after opening a file). */
  recentListKey: string | null;
}

export function WindowsAppMenuBar({
  viewCommandsEnabled,
  exportEnabled,
  locationEnabled,
  globeEnabled,
  recentListKey,
}: WindowsAppMenuBarProps) {
  const [recents, setRecents] = useState<string[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutTitle, setAboutTitle] = useState("");
  const [aboutVersion, setAboutVersion] = useState("");
  /** One top-level menu open at a time; hover switches between File / View / Help like a native menu bar. */
  const [openMenu, setOpenMenu] = useState<BarMenuId | null>(null);

  const handleMenuOpenChange = useCallback((id: BarMenuId) => {
    return (_: MenuOpenEvent, data: MenuOpenChangeData) => {
      if (data.open) {
        setOpenMenu(id);
      } else {
        setOpenMenu((prev) => (prev === id ? null : prev));
      }
    };
  }, []);

  const handleBarTriggerMouseEnter = useCallback((id: BarMenuId) => {
    return () => {
      setOpenMenu((prev) => (prev !== null ? id : prev));
    };
  }, []);

  const loadRecents = useCallback(() => {
    invoke<string[]>("get_recent_files")
      .then(setRecents)
      .catch(() => setRecents([]));
  }, []);

  useEffect(() => {
    loadRecents();
  }, [loadRecents, recentListKey]);

  const openAbout = async () => {
    const [name, ver] = await Promise.all([getName(), getVersion()]);
    setAboutTitle(name);
    setAboutVersion(ver);
    setAboutOpen(true);
  };

  return (
    <>
      <div
        role="menubar"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 0,
          minHeight: 36,
          paddingLeft: tokens.spacingHorizontalSNudge,
          paddingRight: tokens.spacingHorizontalSNudge,
          borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
          backgroundColor: tokens.colorNeutralBackground1,
        }}
      >
        <Menu open={openMenu === "file"} onOpenChange={handleMenuOpenChange("file")}>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              size="small"
              style={menubarTriggerStyle}
              onMouseEnter={handleBarTriggerMouseEnter("file")}
            >
              File
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                onClick={() => {
                  void emit("menu-open-dialog", undefined);
                }}
              >
                Open File…
              </MenuItem>
              {recents.length > 0 && (
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <MenuItem>Open Recent</MenuItem>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {recents.map((path) => (
                        <MenuItem
                          key={path}
                          onClick={() => {
                            void emit("open-file", path);
                          }}
                        >
                          {path.split(/[/\\]/).pop() ?? path}
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              )}
              <MenuDivider />
              <MenuItem
                disabled={!exportEnabled}
                onClick={() => {
                  if (exportEnabled) void emit("menu-export-charts", undefined);
                }}
              >
                Export Charts…
              </MenuItem>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  void invoke("request_exit");
                }}
              >
                Exit
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>

        <Menu open={openMenu === "view"} onOpenChange={handleMenuOpenChange("view")}>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              size="small"
              style={menubarTriggerStyle}
              onMouseEnter={handleBarTriggerMouseEnter("view")}
            >
              View
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                disabled={!viewCommandsEnabled}
                onClick={() => {
                  if (viewCommandsEnabled) void emit("view-first-4-columns", undefined);
                }}
              >
                First 4 Columns
              </MenuItem>
              <MenuItem
                disabled={!viewCommandsEnabled}
                onClick={() => {
                  if (viewCommandsEnabled) void emit("view-all-columns", undefined);
                }}
              >
                All Columns
              </MenuItem>
              <MenuItem
                disabled={!viewCommandsEnabled}
                onClick={() => {
                  if (viewCommandsEnabled) void emit("view-select-columns", undefined);
                }}
              >
                Select Columns…
              </MenuItem>
              <MenuDivider />
              <MenuItem
                disabled={!viewCommandsEnabled || !locationEnabled}
                onClick={() => {
                  if (viewCommandsEnabled && locationEnabled) void emit("view-map-trace", undefined);
                }}
              >
                Map Trace
              </MenuItem>
              <MenuItem
                disabled={!viewCommandsEnabled || !globeEnabled}
                onClick={() => {
                  if (viewCommandsEnabled && globeEnabled) void emit("view-globe-trace", undefined);
                }}
              >
                Globe Trace
              </MenuItem>
              <MenuDivider />
              <MenuItem
                disabled={!viewCommandsEnabled}
                onClick={() => {
                  if (viewCommandsEnabled) void emit("view-toggle-zoom-slider", undefined);
                }}
              >
                Zoom Slider
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>

        <Menu open={openMenu === "help"} onOpenChange={handleMenuOpenChange("help")}>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              size="small"
              style={menubarTriggerStyle}
              onMouseEnter={handleBarTriggerMouseEnter("help")}
            >
              Help
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                onClick={() => {
                  void openUrl(PRODUCT_HOMEPAGE);
                }}
              >
                Product Site…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void emit("check-for-new-version", undefined);
                }}
              >
                Check for Updates…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void openAbout();
                }}
              >
                About…
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      <Dialog open={aboutOpen} onOpenChange={(_, d) => setAboutOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{aboutTitle || "RASOrbit Viewer"}</DialogTitle>
            <DialogContent>
              <Text block>Version {aboutVersion}</Text>
              <Text block style={{ marginTop: tokens.spacingVerticalM }}>
                {ABOUT_INTRO}
              </Text>
              <div style={{ marginTop: tokens.spacingVerticalS }}>
                <Link
                  href={PRODUCT_HOMEPAGE}
                  onClick={(e) => {
                    e.preventDefault();
                    void openUrl(PRODUCT_HOMEPAGE);
                  }}
                >
                  Product site
                </Link>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setAboutOpen(false)}>
                OK
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
