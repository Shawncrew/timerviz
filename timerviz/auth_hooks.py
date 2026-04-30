from allianceauth import hooks
from allianceauth.services.hooks import MenuItemHook, UrlHook


class TimervizMenuItem(MenuItemHook):
    def __init__(self):
        super().__init__(
            "Timer Viz",
            "fa-regular fa-map",
            "timerviz:view",
            navactive=["timerviz:view"],
        )

    def render(self, request):
        if request.user.has_perm("timerviz.view_timerviz"):
            return super().render(request)
        return ""


@hooks.register("menu_item_hook")
def register_menu():
    return TimervizMenuItem()


@hooks.register("url_hook")
def register_url():
    return UrlHook("timerviz.urls", "timerviz", r"^timerviz/")
