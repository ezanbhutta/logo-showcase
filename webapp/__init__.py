"""Local web UI for Logo Showcase.

A small Flask app teammates open in their browser. No accounts, no server —
it runs on their own machine, reads the logo library from the folder set on the
Settings page (their Google Drive sync folder), and produces client PDFs.

Routes:
  /                build a slice/range from a profile + filters
  /gallery/<p>     browse, filter, search, multi-select → make a PDF
  /settings        set the library folder + where PDFs are saved
  /preview/...     serve a logo's screen-res preview
  /download/...    hand back a generated PDF
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)

from engine import config, service


def create_app() -> Flask:
    app = Flask(__name__)

    @app.route("/")
    def index():
        return render_template(
            "index.html",
            profiles=config.list_profiles(),
            cfg=config.load(),
            using_demo=config.is_using_bundled_demo(),
        )

    @app.route("/api/profiles")
    def api_profiles():
        return jsonify(config.list_profiles())

    @app.route("/api/manifest/<profile>")
    def api_manifest(profile):
        try:
            return jsonify(service.gallery_manifest(profile))
        except service.ServiceError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.route("/preview/<profile>/<path:logo_file>")
    def preview(profile, logo_file):
        try:
            p = service.preview_file(profile, logo_file)
        except service.ServiceError:
            abort(404)
        return send_file(p, mimetype=mimetypes.guess_type(p.name)[0] or "image/png")

    @app.route("/generate", methods=["POST"])
    def generate():
        f = request.form
        files = [x for x in f.getlist("files") if x] or None
        try:
            result = service.generate(
                f.get("profile", ""),
                industries=f.getlist("industry"),
                types=f.getlist("type"),
                match=f.get("match", "any"),
                mode=f.get("mode", "slice"),
                count=int(f.get("count", service.DEFAULT_COUNT) or service.DEFAULT_COUNT),
                files=files,
            )
        except service.ServiceError as exc:
            return render_template("result.html", error=str(exc)), 400
        return render_template(
            "result.html",
            ok=True,
            filename=result.path.name,
            size_kb=round(result.size / 1024),
            count=result.count,
            profile=result.profile,
            theme_name=result.theme_name,
            mode=result.mode,
            download_url=url_for("download", name=result.path.name),
            out_dir=str(config.output_dir()),
        )

    @app.route("/download/<path:name>")
    def download(name):
        target = (config.output_dir() / name).resolve()
        # Only serve files inside the configured output directory.
        if config.output_dir().resolve() not in target.parents or not target.exists():
            abort(404)
        return send_file(target, as_attachment=True, download_name=name)

    @app.route("/gallery")
    def gallery_pick():
        profiles = config.list_profiles()
        if profiles:
            return redirect(url_for("gallery", profile=profiles[0]))
        return redirect(url_for("index"))

    @app.route("/gallery/<profile>")
    def gallery(profile):
        return render_template(
            "gallery.html", profile=profile, profiles=config.list_profiles()
        )

    @app.route("/settings", methods=["GET", "POST"])
    def settings():
        if request.method == "POST":
            lib = request.form.get("library_root", "").strip()
            out = request.form.get("output_dir", "").strip()
            errors = []
            if lib:
                if Path(lib).expanduser().is_dir():
                    config.set_library_root(lib)
                else:
                    errors.append(f"Library folder not found: {lib}")
            if out:
                Path(out).expanduser().mkdir(parents=True, exist_ok=True)
                config.set_output_dir(out)
            if errors:
                return render_template(
                    "settings.html", cfg=config.load(),
                    profiles=config.list_profiles(), errors=errors,
                )
            return redirect(url_for("settings", saved=1))
        return render_template(
            "settings.html", cfg=config.load(), profiles=config.list_profiles(),
            saved=request.args.get("saved"), errors=[],
        )

    return app
