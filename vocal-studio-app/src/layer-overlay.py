#!/usr/bin/env python3
# Linux (Wayland : niri, Hyprland, Sway…) : l'overlay de Hush sur la couche « overlay » du bureau (layer-shell).
# C'est la couche des notifications : elle passe devant tout, même un jeu ou une vidéo en plein écran,
# ce qu'une fenêtre normale (Electron) ne peut pas faire. Elle est aussi sur tous les bureaux de son écran.
#
# Hush dessine l'overlay hors écran et envoie ici chaque image ; ce programme ne fait que l'afficher,
# sans jamais prendre la souris ni le clavier.
#
# Messages reçus sur l'entrée standard : 1 octet de type, 4 octets de longueur (petit-boutiste), puis le contenu.
#   b"J" : réglages en JSON { "x", "y", "w", "h", "screen": { "x", "y" }, "edit" } (coin haut gauche, en pixels logiques)
#   b"F" : une image : largeur (4 octets), hauteur (4 octets), puis les pixels BGRA prémultipliés
# Il s'arrête tout seul quand Hush ferme l'entrée standard.
#
# Mode « Déplacer » (edit) : un voile transparent couvre chaque écran le temps du réglage. On fait glisser l'overlay,
# même d'un écran à l'autre ; la molette change sa taille ; Échap, clic droit ou « Terminé » dans Hush pour finir.
# Les voiles ne bougent pas : la souris est suivie à l'endroit exact où elle est, sans à-coups.
# Il renvoie sa nouvelle place à Hush sur la sortie standard, une ligne JSON :
#   { "x", "y", "w", "h", "screen": { "x", "y" } } ou { "edit": false }.
import json
import struct
import sys
import threading

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GtkLayerShell", "0.1")
from gi.repository import Gdk, GLib, Gtk, GtkLayerShell  # noqa: E402
import cairo  # noqa: E402

if not GtkLayerShell.is_supported():
    print("layer-shell indisponible", flush=True)
    sys.exit(3)

MIN_W, MAX_W, MIN_H, MAX_H = 120, 1200, 80, 1400


def monitors():
    disp = Gdk.Display.get_default()
    return [disp.get_monitor(i) for i in range(disp.get_n_monitors())]


def layer_window(title, keyboard):
    w = Gtk.Window(title=title)
    GtkLayerShell.init_for_window(w)
    GtkLayerShell.set_namespace(w, "hush-overlay")
    GtkLayerShell.set_layer(w, GtkLayerShell.Layer.OVERLAY)
    GtkLayerShell.set_keyboard_mode(w, keyboard)
    GtkLayerShell.set_exclusive_zone(w, -1)  # ne pousse pas les autres fenêtres ni les barres
    # Fond transparent : seuls les pixels dessinés s'affichent
    visual = w.get_screen().get_rgba_visual()
    if visual:
        w.set_visual(visual)
    w.set_app_paintable(True)
    return w


class Overlay:
    def __init__(self):
        self.surface = None
        self.cfg = {"x": 24, "y": 24, "w": 280, "h": 420, "screen": None, "edit": False}
        self.veils = []  # mode « Déplacer » : un voile par écran
        self.drag = None  # écart entre le curseur et le coin de l'overlay au moment du clic

        # L'overlay en jeu : petite surface, la souris passe à travers
        self.win = layer_window("Hush · overlay", GtkLayerShell.KeyboardMode.NONE)
        GtkLayerShell.set_anchor(self.win, GtkLayerShell.Edge.TOP, True)
        GtkLayerShell.set_anchor(self.win, GtkLayerShell.Edge.LEFT, True)
        self.win.connect("draw", self.draw_overlay)
        # La souris passe à travers. À refaire à chaque affichage : quand l'overlay est caché puis remontré
        # (fin du mode « Déplacer »), le bureau lui recrée une surface qui, sinon, prendrait de nouveau les clics.
        self.win.connect("realize", lambda *_: self.click_through())
        self.win.connect("map-event", lambda *_: self.click_through())
        self.apply()
        self.win.show_all()

    def click_through(self):
        w = self.win.get_window()
        if w:
            w.input_shape_combine_region(cairo.Region(), 0, 0)
        return False

    # ——— Écrans ———
    def monitor(self):
        s = self.cfg.get("screen") or {}
        for m in monitors():
            g = m.get_geometry()
            if g.x == s.get("x") and g.y == s.get("y"):
                return m
        return None

    def screen_geom(self):
        m = self.monitor()
        if m:
            return m.get_geometry()
        ms = monitors()
        return ms[0].get_geometry() if ms else None

    # ——— Réglages venus de Hush ———
    def apply(self):
        c = self.cfg
        m = self.monitor()
        if m:  # sinon : l'écran que choisit le bureau
            GtkLayerShell.set_monitor(self.win, m)
        GtkLayerShell.set_margin(self.win, GtkLayerShell.Edge.LEFT, int(c["x"]))
        GtkLayerShell.set_margin(self.win, GtkLayerShell.Edge.TOP, int(c["y"]))
        self.win.set_size_request(int(c["w"]), int(c["h"]))
        self.win.resize(int(c["w"]), int(c["h"]))
        self.win.queue_draw()

    def on_config(self, cfg):
        if self.drag:  # pendant qu'on le fait glisser, c'est lui qui décide de sa place
            cfg = {k: v for k, v in cfg.items() if k not in ("x", "y", "screen")}
        edit = cfg.pop("edit", None)
        self.cfg.update(cfg)
        if edit is True and not self.veils:
            self.start_edit()
        elif edit is False and self.veils:
            self.end_edit(report=False)
        if self.veils:
            self.redraw_veils()
        else:
            self.apply()
        return False

    def on_frame(self, w, h, data):
        stride = cairo.ImageSurface.format_stride_for_width(cairo.FORMAT_ARGB32, w)
        if stride != w * 4:  # cairo veut parfois des lignes plus longues
            buf = bytearray(stride * h)
            for y in range(h):
                buf[y * stride:y * stride + w * 4] = data[y * w * 4:(y + 1) * w * 4]
            data = buf
        self.surface = cairo.ImageSurface.create_for_data(bytearray(data), cairo.FORMAT_ARGB32, w, h, stride)
        self.win.queue_draw()
        self.redraw_veils()
        return False

    # ——— Dessin ———
    def paint_image(self, cr, x, y, w):
        if not self.surface:
            return
        # L'image arrive en pixels réels : on la ramène à la taille voulue (écrans à l'échelle 1,5 ou 2, molette)
        cr.save()
        cr.translate(x, y)
        sw = self.surface.get_width()
        if sw and w and sw != w:
            cr.scale(w / sw, w / sw)
        cr.set_source_surface(self.surface, 0, 0)
        cr.paint()
        cr.restore()

    def draw_overlay(self, _widget, cr):
        cr.set_operator(cairo.OPERATOR_SOURCE)
        cr.set_source_rgba(0, 0, 0, 0)
        cr.paint()
        cr.set_operator(cairo.OPERATOR_OVER)
        self.paint_image(cr, 0, 0, self.win.get_allocated_width())
        return True

    def draw_veil(self, widget, cr, mon):
        g = mon.get_geometry()
        cr.set_operator(cairo.OPERATOR_SOURCE)
        cr.set_source_rgba(0, 0, 0, 0.18)  # voile léger : on voit qu'on est en train de régler
        cr.paint()
        cr.set_operator(cairo.OPERATOR_OVER)
        c = self.cfg
        here = self.screen_geom()
        if here and here.x == g.x and here.y == g.y:
            self.paint_image(cr, c["x"], c["y"], c["w"])
            cr.rectangle(c["x"] + 1, c["y"] + 1, c["w"] - 2, c["h"] - 2)
            cr.set_source_rgba(1, 1, 1, 0.10)
            cr.fill_preserve()
            cr.set_source_rgba(1, 1, 1, 0.95)
            cr.set_line_width(2)
            cr.set_dash([8, 6])
            cr.stroke()
        # Le mode d'emploi en bas de chaque écran
        cr.set_dash([])
        text = "Glisse l'overlay (même vers un autre écran) · Molette : taille · Échap ou clic droit : terminé"
        cr.select_font_face("sans-serif", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cr.set_font_size(15)
        ext = cr.text_extents(text)
        tx, ty = (g.width - ext.width) / 2, g.height - 48
        cr.rectangle(tx - 16, ty - 24, ext.width + 32, 36)
        cr.set_source_rgba(0, 0, 0, 0.65)
        cr.fill()
        cr.move_to(tx, ty)
        cr.set_source_rgba(1, 1, 1, 0.95)
        cr.show_text(text)
        return True

    def redraw_veils(self):
        for v, _m in self.veils:
            v.queue_draw()

    # ——— Mode « Déplacer » ———
    def start_edit(self):
        self.win.hide()
        for m in monitors():
            v = layer_window("Hush · réglage", GtkLayerShell.KeyboardMode.ON_DEMAND)
            GtkLayerShell.set_monitor(v, m)
            for e in (GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.BOTTOM, GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.RIGHT):
                GtkLayerShell.set_anchor(v, e, True)
            v.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK
                         | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.SCROLL_MASK
                         | Gdk.EventMask.SMOOTH_SCROLL_MASK | Gdk.EventMask.KEY_PRESS_MASK)
            v.connect("draw", self.draw_veil, m)
            v.connect("button-press-event", self.on_press, m)
            v.connect("button-release-event", self.on_release)
            v.connect("motion-notify-event", self.on_motion, m)
            v.connect("scroll-event", self.on_scroll)
            v.connect("key-press-event", self.on_key)
            v.show_all()
            self.veils.append((v, m))

    def end_edit(self, report=True):
        self.drag = None
        for v, _m in self.veils:
            v.destroy()
        self.veils = []
        self.apply()
        self.win.show_all()
        self.click_through()
        if report:
            self.report({"edit": False})

    def report(self, data):
        print(json.dumps(data), flush=True)

    def report_place(self):
        c, g = self.cfg, self.screen_geom()
        place = {"x": int(c["x"]), "y": int(c["y"]), "w": int(c["w"]), "h": int(c["h"])}
        if g:
            place["screen"] = {"x": g.x, "y": g.y}
        self.report(place)

    def on_press(self, _w, ev, mon):
        if ev.button == 3:
            self.end_edit()
            return True
        if ev.button != 1:
            return True
        g, here, c = mon.get_geometry(), self.screen_geom(), self.cfg
        if not here or here.x != g.x or here.y != g.y:
            return True
        if c["x"] <= ev.x <= c["x"] + c["w"] and c["y"] <= ev.y <= c["y"] + c["h"]:
            self.drag = (ev.x - c["x"], ev.y - c["y"])
        return True

    def on_motion(self, _w, ev, mon):
        if not self.drag:
            return False
        # Position du curseur sur l'ensemble des écrans (le voile où on a cliqué garde la souris, même au-delà)
        g = mon.get_geometry()
        ax, ay = g.x + ev.x, g.y + ev.y
        target = None
        for m in monitors():
            mg = m.get_geometry()
            if mg.x <= ax < mg.x + mg.width and mg.y <= ay < mg.y + mg.height:
                target = mg
                break
        if not target:
            return True
        c = self.cfg
        c["screen"] = {"x": target.x, "y": target.y}
        c["x"] = round(max(0, min(target.width - c["w"], ax - target.x - self.drag[0])))
        c["y"] = round(max(0, min(target.height - c["h"], ay - target.y - self.drag[1])))
        self.redraw_veils()
        return True

    def on_release(self, _w, ev):
        if self.drag and ev.button == 1:
            self.drag = None
            self.report_place()
        return True

    def on_scroll(self, _w, ev):
        if ev.direction == Gdk.ScrollDirection.SMOOTH:
            dy = ev.get_scroll_deltas()[2]
        else:
            dy = -1 if ev.direction == Gdk.ScrollDirection.UP else 1 if ev.direction == Gdk.ScrollDirection.DOWN else 0
        dy = max(-1.0, min(1.0, dy))  # un cran à la fois, même avec une molette rapide ou un pavé tactile
        if not dy:
            return True
        # Molette vers le haut : plus grand (5 % par cran), en gardant les proportions et le centre
        c, g = self.cfg, self.screen_geom()
        sw, sh = (g.width, g.height) if g else (3840, 2160)
        k = 1.05 ** (-dy)
        w = max(MIN_W, min(MAX_W, sw, c["w"] * k))
        h = c["h"] * w / c["w"]
        if h > min(MAX_H, sh) or h < MIN_H:
            return True
        cx, cy = c["x"] + c["w"] / 2, c["y"] + c["h"] / 2
        c["w"], c["h"] = round(w), round(h)
        c["x"] = round(max(0, min(sw - c["w"], cx - c["w"] / 2)))
        c["y"] = round(max(0, min(sh - c["h"], cy - c["h"] / 2)))
        self.redraw_veils()
        # On attend la fin des crans pour envoyer la taille à Hush (il redessine l'overlay à la bonne taille)
        if getattr(self, "scroll_t", None):
            GLib.source_remove(self.scroll_t)
        self.scroll_t = GLib.timeout_add(250, self.scroll_done)
        return True

    def scroll_done(self):
        self.scroll_t = None
        self.report_place()
        return False

    def on_key(self, _w, ev):
        if ev.keyval == Gdk.KEY_Escape:
            self.end_edit()
        return True


def read_exact(stream, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = stream.read(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return bytes(buf)


def reader(ov):
    stream = sys.stdin.buffer
    while True:
        head = read_exact(stream, 5)
        if head is None:
            break
        kind, size = head[:1], struct.unpack("<I", head[1:])[0]
        body = read_exact(stream, size)
        if body is None:
            break
        if kind == b"J":
            try:
                GLib.idle_add(ov.on_config, json.loads(body))
            except ValueError:
                pass
        elif kind == b"F" and size >= 8:
            w, h = struct.unpack("<II", body[:8])
            if w and h and size - 8 == w * h * 4:
                GLib.idle_add(ov.on_frame, w, h, body[8:])
    GLib.idle_add(Gtk.main_quit)


def main():
    ov = Overlay()
    threading.Thread(target=reader, args=(ov,), daemon=True).start()
    print("pret", flush=True)
    Gtk.main()


if __name__ == "__main__":
    main()
