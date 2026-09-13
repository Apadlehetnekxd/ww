import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Zap } from "lucide-react";
import { type ChatModelMode, ULTRA_MESSAGES_PER_COOLDOWN } from "@/lib/ai-services";

export function ChatModeToggle({
  mode,
  onChange,
  disabled = false,
  openDown = false,
  isAuthenticated = false,
  onRequireAuth,
  ultraCooldownRemainingMs = 0,
  ultraMessagesUntilCooldown = ULTRA_MESSAGES_PER_COOLDOWN,
}: {
  mode: ChatModelMode;
  onChange: (mode: ChatModelMode) => void;
  disabled?: boolean;
  openDown?: boolean;
  isAuthenticated?: boolean;
  onRequireAuth?: () => void;
  ultraCooldownRemainingMs?: number;
  ultraMessagesUntilCooldown?: number;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isFast = mode === "fast";
  const isUltra = mode === "ultra";
  const [sliderValue, setSliderValue] = useState(isFast ? 50 : isUltra ? 100 : 0);
  const [lightningBoost, setLightningBoost] = useState(false);
  const particleDuration = Math.max(
    0.72,
    3.2 - 2.48 * Math.pow(sliderValue / 100, 1.2),
  ) / (isUltra && lightningBoost ? 2 : 1);
  const previousModeRef = useRef<ChatModelMode>(isFast || isUltra ? "quality" : "fast");

  const selectMode = (nextMode: ChatModelMode, sliderPosition?: number) => {
    if (nextMode === "ultra" && !isAuthenticated) {
      setSliderValue(mode === "fast" ? 50 : mode === "ultra" ? 100 : 0);
      onRequireAuth?.();
      return;
    }
    if (nextMode === mode) {
      if (sliderPosition !== undefined) setSliderValue(sliderPosition);
      return;
    }
    previousModeRef.current = mode;
    setLightningBoost(false);
    setSliderValue(
      sliderPosition ?? (nextMode === "fast" ? 50 : nextMode === "ultra" ? 100 : 0),
    );
    onChange(nextMode);
  };

  useEffect(() => {
    setSliderValue((currentValue) => {
      const currentMode = currentValue < 34 ? "quality" : currentValue < 67 ? "fast" : "ultra";
      return currentMode === mode ? currentValue : mode === "fast" ? 50 : mode === "ultra" ? 100 : 0;
    });
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={pickerRef}
      className={
        "tf-model-picker" +
        (isFast ? " tf-model-picker-fast" : "") +
        (isUltra ? " tf-model-picker-ultra" : "") +
        (isUltra && lightningBoost ? " tf-model-picker-ultra-boost" : "") +
        (openDown ? " tf-model-picker-down" : "")
      }
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="tf-model-trigger"
      >
        <span className="tf-model-trigger-label">
          {isUltra ? "Ultra" : isFast ? "Speed" : "Quality"}
        </span>
        <ChevronDown className={"size-3.5 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="tf-model-popover" role="dialog" aria-label="AI response mode">
          <div className="tf-model-popover-heading">
            <button
              type="button"
              className={"tf-model-mode-icon-button" + (lightningBoost ? " is-on" : "")}
              onClick={() => setLightningBoost((enabled) => !enabled)}
              disabled={!isUltra || disabled}
              aria-label={lightningBoost ? "Disable lightning boost" : "Enable lightning boost"}
              aria-pressed={lightningBoost}
              title={isUltra ? "Toggle 2x lightning boost" : "Available in Ultra mode"}
            >
              <Zap
                className={"tf-model-mode-icon" + (lightningBoost ? " tf-ultra-bolt" : "")}
                aria-hidden="true"
              />
            </button>
            <div className="tf-model-popover-caption">
              <button
                type="button"
                className="tf-model-title-switch"
                aria-label={
                  "Switch to " +
                  (isUltra ? "Speed" : isFast ? "Quality" : "Ultra") +
                  " mode"
                }
                onClick={() => selectMode(isUltra ? "fast" : isFast ? "quality" : "ultra")}
                disabled={disabled}
              >
                <span>{isUltra ? "Ultra" : isFast ? "Speed" : "Quality"}</span>
                <ChevronRight className="size-3" aria-hidden="true" />
              </button>
              <span className="tf-model-popover-subtitle">
                {isUltra
                  ? ultraCooldownRemainingMs > 0
                    ? "Cooldown · " + Math.ceil(ultraCooldownRemainingMs / 60000) + " min"
                    : "Thoughtful · " + ultraMessagesUntilCooldown + " left"
                  : isFast
                    ? "Nemotron"
                    : "Dots"}
              </span>
            </div>
            <button
              type="button"
              className="tf-model-reset"
              aria-label={"Switch back to " + (previousModeRef.current === "fast" ? "Speed" : previousModeRef.current === "ultra" ? "Ultra" : "Quality") + " mode"}
              title={"Switch back to " + (previousModeRef.current === "fast" ? "Speed" : previousModeRef.current === "ultra" ? "Ultra" : "Quality")}
              onClick={() => selectMode(previousModeRef.current)}
              disabled={disabled}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="tf-model-slider">
            <div className="tf-model-slider-track" aria-hidden="true">
              <div
                className="tf-model-particles"
                style={{ "--model-particle-duration": particleDuration + "s" } as CSSProperties}
              >
                {Array.from({ length: 15 }, (_, index) => <span key={index} />)}
              </div>
            </div>
            <input
              aria-label="AI response mode slider"
              aria-valuetext={
                isUltra ? "Ultra — one thoughtful answer" : isFast ? "Speed — Nemotron" : "Quality — Dots"
              }
              disabled={disabled}
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderValue}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                selectMode(nextValue < 34 ? "quality" : nextValue < 67 ? "fast" : "ultra", nextValue);
              }}
              className="tf-model-range"
            />
          </div>

          {!isAuthenticated && (
            <p className="tf-model-ultra-note">Ultra requires sign-in</p>
          )}

          <div className="sr-only">
            <span>Quality</span>
            <span>Speed</span>
            <span>Ultra</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Attachment preview chips shown above the composer input. */
