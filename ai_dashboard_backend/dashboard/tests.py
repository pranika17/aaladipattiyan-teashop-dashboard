import hashlib
from unittest.mock import patch

from django.test import TestCase


class PartnerApiKeyTests(TestCase):
    api_key = "tea_live_test_partner_key"

    def setUp(self):
        self.env = patch.dict(
            "os.environ",
            {"PARTNER_API_KEY_HASH": hashlib.sha256(self.api_key.encode()).hexdigest()},
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_missing_key_is_rejected(self):
        response = self.client.get("/api/partner/dashboard/live/")
        self.assertEqual(response.status_code, 401)

    def test_wrong_key_is_rejected(self):
        response = self.client.get(
            "/api/partner/dashboard/live/",
            HTTP_AUTHORIZATION="Bearer tea_live_wrong",
        )
        self.assertEqual(response.status_code, 401)

    @patch("dashboard.views.get_dashboard_snapshot", return_value={"items": []})
    def test_valid_key_is_accepted(self, snapshot):
        response = self.client.get(
            "/api/partner/dashboard/live/?date=2026-07-16",
            HTTP_AUTHORIZATION=f"Bearer {self.api_key}",
        )
        self.assertEqual(response.status_code, 200)
        snapshot.assert_called_once_with("2026-07-16")

# Create your tests here.
