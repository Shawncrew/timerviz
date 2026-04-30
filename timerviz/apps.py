from django.apps import AppConfig


class TimervizConfig(AppConfig):
    name = "timerviz"
    label = "timerviz"
    verbose_name = "Timer Visualization"

    def ready(self):
        import timerviz.auth_hooks  # noqa: F401
