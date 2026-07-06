from django.urls import path

from .views import live_dashboard


urlpatterns = [
    path("dashboard/live/", live_dashboard, name="live-dashboard"),
]
