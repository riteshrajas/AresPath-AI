# AresPath backend

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

Interactive API docs: http://127.0.0.1:8001/docs.
For tests, install `backend/requirements-dev.txt`, then run
`python -m pytest backend/tests -q`. Real-data checks require the prepared rasters.

See [the framework guide](../docs/FRAMEWORK.md) for source preparation, tile
contract, configuration, cache lifecycle and limitations.
