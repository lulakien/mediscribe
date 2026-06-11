from __future__ import annotations

from pathlib import Path
from queue import Empty, Queue
from threading import Thread
from typing import Any

import gradio as gr
import pandas as pd

from transcribe_core import (
    AUDIO_EXTENSIONS,
    BACKEND_CHOICES,
    ProgressEvent,
    TranscriptionOptions,
    load_config,
    options_from_config,
    run_batch,
    seconds_to_hms,
)


ROOT = Path(__file__).parent
DEFAULT_INPUT = str(ROOT / "input_audio")
DEFAULT_OUTPUT = str(ROOT / "output")
CONFIG = load_config(ROOT / "config.yaml")
DEFAULT_OPTIONS = options_from_config(CONFIG)

MODEL_CHOICES = ["large-v3", "large-v3-turbo", "medium", "small"]
DEVICE_CHOICES = ["auto", "cuda", "cpu"]
COMPUTE_CHOICES = ["auto", "float16", "int8_float16", "int8"]


def make_options(
    backend: str,
    model_name: str,
    device: str,
    compute_type: str,
    beam_size: int,
    vad_filter: bool,
) -> TranscriptionOptions:
    return TranscriptionOptions(
        backend=backend,
        model_name=model_name,
        device=device,
        compute_type=compute_type,
        language=DEFAULT_OPTIONS.language,
        beam_size=int(beam_size),
        vad_filter=bool(vad_filter),
        condition_on_previous_text=DEFAULT_OPTIONS.condition_on_previous_text,
        temperature=DEFAULT_OPTIONS.temperature,
        initial_prompt=DEFAULT_OPTIONS.initial_prompt,
    )


def metrics_markdown(event: ProgressEvent | None = None) -> str:
    metrics = event.metrics if event else None
    return "\n".join(
        [
            f"Current file duration: {seconds_to_hms(metrics.current_file_duration) if metrics else ''}",
            f"Wall-clock processing time: {format_seconds(metrics.wall_time_seconds if metrics else None)}",
            f"Realtime factor: {format_number(metrics.realtime_factor if metrics else None)}",
            f"Average audio seconds processed per second: {format_number(metrics.audio_seconds_per_second if metrics else None)}",
            f"Total processed duration: {seconds_to_hms(metrics.total_processed_duration) if metrics else '00:00:00'}",
            f"Total elapsed time: {format_seconds(metrics.total_elapsed_time if metrics else None)}",
            f"Device actually used: {metrics.device_used if metrics else ''}",
            f"Compute type actually used: {metrics.compute_type_used if metrics else ''}",
        ]
    )


def status_dataframe(rows: list[dict[str, Any]] | None = None) -> pd.DataFrame:
    return pd.DataFrame(
        rows or [],
        columns=["file", "source", "duration", "status", "warning/error", "output"],
    )


def selected_files_dataframe(selected_files: list[Any] | None = None) -> pd.DataFrame:
    rows: list[dict[str, str]] = []
    for item in selected_files or []:
        path = file_item_path(item)
        filename = Path(path).name if path else ""
        status = "pending" if path and Path(path).suffix.lower() in AUDIO_EXTENSIONS else "unsupported"
        warning = "" if status == "pending" else "Unsupported extension"
        rows.append(
            {
                "filename": filename,
                "source path": path or "",
                "status": status,
                "warning": warning,
            }
        )
    return pd.DataFrame(rows, columns=["filename", "source path", "status", "warning"])


def file_item_path(item: Any) -> str:
    if item is None:
        return ""
    if isinstance(item, (str, Path)):
        return str(item)
    if isinstance(item, dict):
        return str(item.get("path") or item.get("name") or "")
    return str(getattr(item, "path", None) or getattr(item, "name", "") or "")


def run_ui(
    dry_run: bool,
    input_mode: str,
    selected_files: list[Any] | None,
    input_folder: str,
    output_folder: str,
    backend: str,
    model_name: str,
    device: str,
    compute_type: str,
    beam_size: int,
    vad_filter: bool,
    normalize_audio: bool,
    overwrite: bool,
):
    event_queue: Queue[ProgressEvent | None] = Queue()
    options = make_options(backend, model_name, device, compute_type, beam_size, vad_filter)

    def callback(event: ProgressEvent) -> None:
        event_queue.put(event)

    def worker() -> None:
        try:
            run_batch(
                input_folder=input_folder,
                output_folder=output_folder,
                options=options,
                normalize_audio=normalize_audio,
                overwrite=overwrite,
                dry_run=dry_run,
                progress_callback=callback,
                selected_files=selected_files,
                input_mode="selected_files" if input_mode == "Selected files" else "folder",
            )
        except Exception as exc:
            event_queue.put(
                ProgressEvent(
                    message=str(exc),
                    model_status="Stopped.",
                    log_tail=str(exc),
                    progress=1.0,
                )
            )
        finally:
            event_queue.put(None)

    Thread(target=worker, daemon=True).start()
    last_event = ProgressEvent(
        message="Starting...",
        model_status="Starting...",
        progress=0.0,
    )
    yield outputs_from_event(last_event)

    while True:
        try:
            event = event_queue.get(timeout=0.5)
        except Empty:
            continue
        if event is None:
            if last_event.model_status != "Stopped.":
                last_event.message = "Finished."
                last_event.progress = 1.0
            yield outputs_from_event(last_event)
            break
        last_event = event
        yield outputs_from_event(event)


def outputs_from_event(event: ProgressEvent):
    return (
        event.progress,
        event.current_file,
        status_dataframe(event.status_rows),
        event.model_status,
        metrics_markdown(event),
        event.log_tail,
    )


def format_seconds(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}s"


def format_number(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.3f}"


def start_transcription(*args):
    yield from run_ui(False, *args)


def dry_run_scan(*args):
    yield from run_ui(True, *args)


with gr.Blocks(title="MediScribe Local Transcriber") as demo:
    gr.Markdown("# MediScribe Local Transcriber")
    gr.Markdown("Local Turkish medical lecture transcription with faster-whisper.")

    input_mode = gr.Radio(
        label="Input mode",
        choices=["Selected files", "Input folder"],
        value="Selected files",
    )
    selected_files = gr.File(
        label="Add audio files",
        file_count="multiple",
        type="filepath",
    )
    selected_files_table = gr.Dataframe(
        label="Pending selected files",
        value=selected_files_dataframe(),
        wrap=True,
        interactive=False,
    )

    with gr.Row():
        input_folder = gr.Textbox(label="Input folder path", value=DEFAULT_INPUT)
        output_folder = gr.Textbox(label="Output folder path", value=DEFAULT_OUTPUT)

    with gr.Row():
        backend = gr.Dropdown(label="Backend", choices=BACKEND_CHOICES, value=DEFAULT_OPTIONS.backend)
        model_name = gr.Dropdown(label="Model", choices=MODEL_CHOICES, value=DEFAULT_OPTIONS.model_name)
        device = gr.Dropdown(label="Device", choices=DEVICE_CHOICES, value=DEFAULT_OPTIONS.device)
        compute_type = gr.Dropdown(
            label="Compute type",
            choices=COMPUTE_CHOICES,
            value=DEFAULT_OPTIONS.compute_type,
        )

    with gr.Row():
        beam_size = gr.Slider(label="Beam size", minimum=1, maximum=10, value=DEFAULT_OPTIONS.beam_size, step=1)
        vad_filter = gr.Checkbox(label="VAD", value=DEFAULT_OPTIONS.vad_filter)
        normalize_audio = gr.Checkbox(label="Audio normalization", value=False)
        overwrite = gr.Checkbox(label="Overwrite existing outputs", value=False)

    with gr.Row():
        start_button = gr.Button("Start transcription", variant="primary")
        dry_run_button = gr.Button("Dry-run / scan-only")

    progress = gr.Slider(label="Progress", minimum=0, maximum=1, value=0, interactive=False)
    current_file = gr.Textbox(label="Current file being processed", interactive=False)
    model_status = gr.Textbox(label="Model loading status", interactive=False)
    metrics = gr.Textbox(label="Speed metrics", lines=8, interactive=False)
    status_table = gr.Dataframe(label="Per-file status table", value=status_dataframe(), wrap=True)
    logs = gr.Textbox(label="Log output", lines=14, interactive=False)

    inputs = [
        input_mode,
        selected_files,
        input_folder,
        output_folder,
        backend,
        model_name,
        device,
        compute_type,
        beam_size,
        vad_filter,
        normalize_audio,
        overwrite,
    ]
    outputs = [progress, current_file, status_table, model_status, metrics, logs]

    selected_files.change(selected_files_dataframe, inputs=[selected_files], outputs=[selected_files_table])
    start_button.click(start_transcription, inputs=inputs, outputs=outputs)
    dry_run_button.click(dry_run_scan, inputs=inputs, outputs=outputs)


if __name__ == "__main__":
    demo.queue().launch()
