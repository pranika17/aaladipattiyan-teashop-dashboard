from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .services import get_dashboard_snapshot


def _cors(response):
    response["Access-Control-Allow-Origin"] = "http://localhost:3000"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response


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
