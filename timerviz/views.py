import json

from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.db import models
from django.http import JsonResponse
from django.utils import timezone
from django.views import View
from django.views.generic import TemplateView

from allianceauth.timerboard.models import Timer

from .models import SystemPosition, TimerRepairState


def _upcoming_window_min():
    return getattr(settings, "TIMERVIZ_UPCOMING_WINDOW_MIN", 60)


def _repair_window_min():
    return getattr(settings, "TIMERVIZ_REPAIR_WINDOW_MIN", 15)


class TimervizView(LoginRequiredMixin, PermissionRequiredMixin, TemplateView):
    template_name = "timerviz/view.html"
    permission_required = "timerviz.view_timerviz"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["upcoming_window_min"] = _upcoming_window_min()
        ctx["repair_window_min"] = _repair_window_min()
        ctx["can_confirm"] = self.request.user.has_perm("timerviz.confirm_repair")
        ctx["can_configure"] = self.request.user.has_perm("timerviz.configure_timerviz")
        return ctx


class TimerDataView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = "timerviz.view_timerviz"

    def get(self, request):
        now = timezone.now()

        confirmed_ids = set(TimerRepairState.objects.values_list("timer_id", flat=True))

        qs = Timer.objects.filter(eve_time__gte=now - timezone.timedelta(hours=24))

        if not request.user.has_perm("auth.timer_management"):
            try:
                user_corp = request.user.profile.main_character.corporation_id
                qs = qs.filter(
                    models.Q(corp_timer=False)
                    | models.Q(eve_corp__corporation_id=user_corp)
                )
            except Exception:
                qs = qs.filter(corp_timer=False)

        timers = [
            {
                "id": t.pk,
                "eve_time": t.eve_time.isoformat(),
                "system": t.system,
                "planet_moon": t.planet_moon,
                "structure": t.structure,
                "objective": t.objective,
                "timer_type": t.timer_type,
                "details": t.details,
                "important": t.important,
                "confirmed": t.pk in confirmed_ids,
            }
            for t in qs.order_by("eve_time")
        ]

        return JsonResponse({
            "timers": timers,
            "upcoming_window_min": _upcoming_window_min(),
            "repair_window_min": _repair_window_min(),
            "can_confirm": request.user.has_perm("timerviz.confirm_repair"),
            "can_configure": request.user.has_perm("timerviz.configure_timerviz"),
            "server_time": now.isoformat(),
        })


class ConfirmRepairView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = "timerviz.confirm_repair"

    def post(self, request, timer_id):
        try:
            Timer.objects.get(pk=timer_id)
        except Timer.DoesNotExist:
            return JsonResponse({"error": "Timer not found"}, status=404)

        obj, created = TimerRepairState.objects.get_or_create(
            timer_id=timer_id,
            defaults={"confirmed_by": request.user},
        )
        return JsonResponse({"ok": True, "created": created, "timer_id": timer_id})


class SystemPositionsView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = "timerviz.view_timerviz"

    def get(self, request):
        positions = {
            p.system_name: {"nx": p.nx, "ny": p.ny}
            for p in SystemPosition.objects.all()
        }
        return JsonResponse({"positions": positions})

    def post(self, request):
        if not request.user.has_perm("timerviz.configure_timerviz"):
            return JsonResponse({"error": "Permission denied"}, status=403)

        try:
            data = json.loads(request.body)
            system_name = data["system_name"]
            nx = float(data["nx"])
            ny = float(data["ny"])
        except (KeyError, ValueError, json.JSONDecodeError):
            return JsonResponse({"error": "Invalid payload"}, status=400)

        if not (0.0 <= nx <= 1.0 and 0.0 <= ny <= 1.0):
            return JsonResponse({"error": "Coordinates out of range"}, status=400)

        SystemPosition.objects.update_or_create(
            system_name=system_name,
            defaults={"nx": nx, "ny": ny, "updated_by": request.user},
        )
        return JsonResponse({"ok": True, "system_name": system_name, "nx": nx, "ny": ny})


class ResetSystemPositionsView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = "timerviz.configure_timerviz"

    def post(self, request):
        try:
            data = json.loads(request.body)
            system_name = data.get("system_name")
        except (json.JSONDecodeError, AttributeError):
            system_name = None

        if system_name:
            SystemPosition.objects.filter(system_name=system_name).delete()
        else:
            SystemPosition.objects.all().delete()

        return JsonResponse({"ok": True})
