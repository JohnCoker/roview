import { useCallback } from "react";
import {
  Button,
  Dropdown,
  Option,
  Slider,
  Text,
  Tooltip,
  tokens,
} from "@fluentui/react-components";
import {
  Play16Regular,
  Pause16Regular,
  Previous16Regular,
  Stop16Regular,
  ArrowRepeatAll16Regular,
  ArrowRepeatAllOff16Regular,
} from "@fluentui/react-icons";

export interface PlaybackBarProps {
  timeMin: number;
  timeMax: number;
  currentTime: number;
  /** When true, charts show the scrub highlight; false is the default (e.g. clean exports). */
  playbackActive: boolean;
  isPlaying: boolean;
  speed: number;
  isLooping: boolean;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  /** Leave playback mode: hide highlight on charts and reset time/speed state. */
  onExitPlayback: () => void;
  onSpeedChange: (speed: number) => void;
  onLoopToggle: () => void;
}

const SPEED_OPTIONS = [1, 5, 10, 100, 500, 1000];

function formatElapsed(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `T+ ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `T+ ${m}:${String(s).padStart(2, "0")}`;
}

export function PlaybackBar({
  timeMin,
  timeMax,
  currentTime,
  playbackActive,
  isPlaying,
  speed,
  isLooping,
  onTimeChange,
  onPlayPause,
  onReset,
  onExitPlayback,
  onSpeedChange,
  onLoopToggle,
}: PlaybackBarProps) {
  const duration = timeMax - timeMin;
  const durationLabel = formatElapsed(duration);
  const elapsedWidthCh = `${durationLabel.length}ch`;
  const timeColumnStyle = {
    whiteSpace: "nowrap" as const,
    display: "inline-block" as const,
    width: elapsedWidthCh,
    fontVariantNumeric: "tabular-nums" as const,
  };
  const sliderValue = duration > 0 ? ((currentTime - timeMin) / duration) * 1000 : 0;

  const handleSliderChange = useCallback(
    (_: unknown, data: { value: number }) => {
      onTimeChange(timeMin + (data.value / 1000) * duration);
    },
    [timeMin, duration, onTimeChange],
  );

  return (
    <div
      className="playback-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalM,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        backgroundColor: tokens.colorNeutralBackground2,
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        flexShrink: 0,
      }}
    >
      <Text
        size={200}
        weight="medium"
        style={timeColumnStyle}
      >
        {formatElapsed(currentTime - timeMin)}
      </Text>

      <Tooltip content="Skip to start" relationship="label">
        <Button
          size="small"
          appearance="subtle"
          icon={<Previous16Regular />}
          onClick={onReset}
          aria-label="Skip to start"
        />
      </Tooltip>

      <Tooltip content={isPlaying ? "Pause" : "Play"} relationship="label">
        <Button
          size="small"
          appearance="subtle"
          icon={isPlaying ? <Pause16Regular /> : <Play16Regular />}
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
        />
      </Tooltip>

      <Tooltip content="Stop" relationship="label">
        <Button
          size="small"
          appearance="subtle"
          icon={<Stop16Regular />}
          onClick={onExitPlayback}
          disabled={!playbackActive}
          aria-label="Stop"
        />
      </Tooltip>

      <Tooltip content={isLooping ? "Turn off repeat" : "Repeat"} relationship="label">
        <Button
          size="small"
          appearance={isLooping ? "primary" : "subtle"}
          icon={isLooping ? <ArrowRepeatAll16Regular /> : <ArrowRepeatAllOff16Regular />}
          onClick={onLoopToggle}
          aria-label={isLooping ? "Turn off repeat" : "Repeat"}
        />
      </Tooltip>

      <Tooltip content="Playback speed" relationship="label">
        <Dropdown
          size="small"
          value={`${speed}x`}
          selectedOptions={[String(speed)]}
          onOptionSelect={(_, data) => {
            const v = Number(data.optionValue);
            if (Number.isFinite(v)) onSpeedChange(v);
          }}
          style={{ minWidth: "72px" }}
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((s) => (
            <Option key={s} text={`${s}x`} value={String(s)}>
              {s}x
            </Option>
          ))}
        </Dropdown>
      </Tooltip>

      <Slider
        size="small"
        min={0}
        max={1000}
        step={1}
        value={Math.round(sliderValue)}
        onChange={handleSliderChange}
        style={{
          flex: 1,
          minWidth: 80,
          ["--fui-Slider__rail--size" as string]: "3px",
          ["--fui-Slider__rail--color" as string]: tokens.colorNeutralStroke1,
        }}
        aria-label="Seek"
      />

      <Text
        size={200}
        style={{ ...timeColumnStyle, textAlign: "end" }}
      >
        {durationLabel}
      </Text>
    </div>
  );
}
