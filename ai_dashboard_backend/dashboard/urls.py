from django.urls import path

from .views import camera_live_dashboard, live_dashboard, partner_live_dashboard


urlpatterns = [
    path("dashboard/live/", live_dashboard, name="live-dashboard"),
    path("camera/live/", camera_live_dashboard, name="camera-live-dashboard"),
    path("partner/dashboard/live/", partner_live_dashboard, name="partner-live-dashboard"),
]
