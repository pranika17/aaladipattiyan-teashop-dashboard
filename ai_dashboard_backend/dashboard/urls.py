from django.urls import path

from .views import live_dashboard, partner_live_dashboard


urlpatterns = [
    path("dashboard/live/", live_dashboard, name="live-dashboard"),
    path("partner/dashboard/live/", partner_live_dashboard, name="partner-live-dashboard"),
]
