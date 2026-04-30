from django.urls import path

from . import views

app_name = "timerviz"

urlpatterns = [
    path("", views.TimervizView.as_view(), name="view"),
    path("api/timers/", views.TimerDataView.as_view(), name="timer_data"),
    path("api/confirm/<int:timer_id>/", views.ConfirmRepairView.as_view(), name="confirm_repair"),
]
