# =========================================================
# FF Visit Ops — Entry Point
# Serves admin panel at / while keeping app.py's API untouched
# Run: python main.py
# Open: http://localhost:5000/
# =========================================================

import os
from flask import send_from_directory
from app import app  # imports the untouched Flask app with /visit route

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


@app.route("/", methods=["GET"])
def admin_index():
    """Serve the admin dashboard at root URL."""
    return send_from_directory(STATIC_DIR, "admin.html")


@app.route("/admin", methods=["GET"])
def admin_alias():
    """Optional alias: /admin also opens the dashboard."""
    return send_from_directory(STATIC_DIR, "admin.html")


@app.route("/favicon.ico")
def favicon():
    """Silence favicon 404s."""
    return "", 204


if __name__ == "__main__":
    print("=" * 58)
    print("  🔥 FF Visit Ops — Admin Panel")
    print("  🌐 Dashboard : http://localhost:12549/")
    print("  🚀 API       : http://localhost:12549/visit?uid=...&region=...")
    print("=" * 58)
    app.run(host="0.0.0.0", port=12549, debug=False, use_reloader=False)