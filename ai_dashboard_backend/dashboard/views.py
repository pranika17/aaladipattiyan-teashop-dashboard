import hashlib
import hmac
import os

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .services import get_dashboard_snapshot


def _cors(response):
    allowed_origin = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    response["Access-Control-Allow-Origin"] = allowed_origin
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def _has_valid_partner_key(request):
    authorization = request.headers.get("Authorization", "")
    scheme, separator, api_key = authorization.partition(" ")
    expected_hash = os.environ.get("PARTNER_API_KEY_HASH", "").strip().lower()

    if scheme.lower() != "bearer" or not separator or not api_key or not expected_hash:
        return False

    supplied_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return hmac.compare_digest(supplied_hash, expected_hash)


@csrf_exempt
def live_dashboard(request):
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))

    if request.method != "GET":
        response = JsonResponse({"error": "Method not allowed"}, status=405)
        return _cors(response)

    try:
        data = get_dashboard_snapshot(request.GET.get("date"))
        response = JsonResponse(data)
    except Exception as exc:
        response = JsonResponse({"error": str(exc)}, status=502)

    return _cors(response)


@csrf_exempt
def partner_live_dashboard(request):
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))

    if request.method != "GET":
        return _cors(JsonResponse({"error": "Method not allowed"}, status=405))

    if not _has_valid_partner_key(request):
        response = JsonResponse({"error": "Invalid or missing API key"}, status=401)
        response["WWW-Authenticate"] = "Bearer"
        return _cors(response)

    try:
        response = JsonResponse(get_dashboard_snapshot(request.GET.get("date")))
    except Exception as exc:
        response = JsonResponse({"error": str(exc)}, status=502)

    return _cors(response)
