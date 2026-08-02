import hashlib
from unittest.mock import patch

from django.test import TestCase

from .services import get_camera_dashboard_snapshot, get_dashboard_snapshot


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


class ReconciliationTests(TestCase):
    @patch("dashboard.services._camera_snapshot", return_value={"latest": None})
    @patch("dashboard.services._request_pos_sales")
    def test_catalog_fills_missing_name_but_sales_stay_from_pos(self, pos, camera):
        pos.return_value = {
            "date": "2026-07-17", "outlet": {"code": "UPK"},
            "items": [{"itemCode": "BDT", "totalQty": 4, "totalBills": 2}],
        }
        result = get_dashboard_snapshot("2026-07-17")
        tea = next(item for item in result["items"] if item["itemCode"] == "BDT")
        self.assertEqual(tea["itemName"], "Bus Driver Tea")
        self.assertEqual(tea["totalQty"], 4)
        self.assertEqual(len(result["items"]), 49)

    @patch("dashboard.services._camera_snapshot", return_value={"latest": None})
    @patch("dashboard.services._request_pos_sales")
    def test_duplicate_pos_rows_for_one_code_are_aggregated(self, pos, camera):
        pos.return_value = {
            "date": "2026-07-17", "outlet": {"code": "UPK"},
            "items": [
                {"itemCode": "2683-KCPC", "itemName": "Parcel -WC", "totalQty": 2, "totalBills": 1},
                {"itemCode": "2683-KCPC", "itemName": "Parcel With Cover", "totalQty": 3, "totalBills": 2},
            ],
        }
        result = get_dashboard_snapshot("2026-07-17")
        coffee = next(item for item in result["items"] if item["itemCode"] == "2683-KCPC")
        coffee_group = next(group for group in result["groups"] if group["key"] == "coffee")
        self.assertEqual(coffee["totalQty"], 5)
        self.assertEqual(coffee["totalBills"], 3)
        self.assertEqual(coffee_group["totalQty"], 5)

    @patch("dashboard.services._camera_snapshot")
    @patch("dashboard.services._request_pos_sales")
    def test_billed_drinks_exclude_biscuits_and_frames_are_not_summed(self, pos, camera):
        pos.return_value = {
            "date": "2026-07-16",
            "outlet": {"code": "UPK", "name": "Urapakkam"},
            "summary": {"totalBills": 2},
            "items": [
                {"itemCode": "BDT", "totalQty": 3, "totalBills": 2},
                {"itemCode": "2345-BB", "totalQty": 4, "totalBills": 1},
            ],
        }
        camera.return_value = {
            "available": True,
            "latest": {"cupCount": 1},
            "daily": {"sampleCount": 41, "maxCupsVisible": 1},
            "countingMode": "daily_cumulative",
        }

        result = get_dashboard_snapshot("2026-07-16")

        self.assertEqual(result["reconciliation"]["billedDrinkQty"], 3)
        self.assertEqual(result["reconciliation"]["cameraCupTotal"], 1)
        self.assertTrue(result["reconciliation"]["isComparable"])
        self.assertEqual(result["reconciliation"]["status"], "not_matched")
        self.assertEqual(result["reconciliation"]["absoluteDifference"], 2)
        self.assertEqual(result["reconciliation"]["differenceDirection"], "camera_under")

    @patch("dashboard.services._camera_snapshot")
    @patch("dashboard.services._request_pos_sales")
    def test_any_nonzero_difference_is_reported_as_not_matched(self, pos, camera):
        pos.return_value = {
            "date": "2026-07-16",
            "outlet": {"code": "UPK"},
            "items": [{"itemCode": "BDT", "totalQty": 100, "totalBills": 50}],
        }
        camera.return_value = {
            "available": True,
            "latest": {"cupCount": 99},
            "countingMode": "daily_cumulative",
        }

        result = get_dashboard_snapshot("2026-07-16")["reconciliation"]

        self.assertEqual(result["matchRate"], 99.0)
        self.assertEqual(result["status"], "not_matched")
        self.assertEqual(result["absoluteDifference"], 1)

    @patch("dashboard.services._camera_snapshot")
    @patch("dashboard.services._request_pos_sales")
    def test_snapshot_camera_count_is_not_compared_to_daily_billing(self, pos, camera):
        pos.return_value = {
            "date": "2026-07-16",
            "outlet": {"code": "UPK"},
            "items": [{"itemCode": "BDT", "totalQty": 3, "totalBills": 2}],
        }
        camera.return_value = {
            "available": True,
            "latest": {"cupCount": 3},
            "countingMode": "latest_snapshot",
        }

        result = get_dashboard_snapshot("2026-07-16")["reconciliation"]

        self.assertFalse(result["isComparable"])
        self.assertEqual(result["status"], "not_comparable")

    @patch("dashboard.services._camera_snapshot")
    def test_camera_dashboard_does_not_call_pos(self, camera):
        camera.return_value = {"available": True, "latest": {"cupCount": 1}}
        result = get_camera_dashboard_snapshot("2026-07-16")
        self.assertEqual(result["camera"]["latest"]["cupCount"], 1)
        self.assertEqual(result["meta"]["source"], "Neon AI camera database")

    @patch("dashboard.services._camera_snapshot", return_value={"latest": None})
    @patch("dashboard.services._request_pos_sales")
    def test_decimal_pos_quantities_are_not_truncated(self, pos, camera):
        pos.return_value = {
            "date": "2026-07-17", "outlet": {"code": "UPK"},
            "summary": {"totalBills": 1},
            "items": [{"itemCode": "1.5Q", "totalQty": 1.5, "totalBills": 1}],
        }
        result = get_dashboard_snapshot("2026-07-17")
        tea = next(group for group in result["groups"] if group["key"] == "tea")
        self.assertEqual(tea["totalQty"], 1.5)
        self.assertEqual(result["reconciliation"]["billedDrinkQty"], 1.5)

# Create your tests here.
