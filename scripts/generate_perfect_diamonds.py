import os, math
import numpy as np
from AppKit import NSImage, NSBitmapImageRep, NSPNGFileType, NSColor
from Foundation import NSURL

out_dir = '/Users/kuldeepsingh/Documents/Other Study Material and Projects/Heyman Diamond LLC Website/public/diamonds'
os.makedirs(out_dir, exist_ok=True)

SIZE = 160
OUT_CENTER = SIZE / 2.0

ref_p = '/Users/kuldeepsingh/.gemini/antigravity/brain/ab65e54b-42e7-417c-b815-5f294ac4aba6/.user_uploaded/media_1794182936311_662f9c42.jpg'
matched_p = '/Users/kuldeepsingh/Documents/Other Study Material and Projects/Heyman Diamond LLC Website/public/matched-pairs-diamonds.jpg'

ref_img = NSImage.alloc().initWithContentsOfURL_(NSURL.fileURLWithPath_(ref_p))
ref_rep = NSBitmapImageRep.imageRepWithData_(ref_img.TIFFRepresentation())
w_ref, h_ref = ref_rep.pixelsWide(), ref_rep.pixelsHigh()

matched_img = NSImage.alloc().initWithContentsOfURL_(NSURL.fileURLWithPath_(matched_p))
matched_rep = NSBitmapImageRep.imageRepWithData_(matched_img.TIFFRepresentation())
w_matched, h_matched = matched_rep.pixelsWide(), matched_rep.pixelsHigh()

def make_rep():
    return NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
        None, SIZE, SIZE, 8, 4, True, False, 'NSCalibratedRGBColorSpace', SIZE * 4, 32
    )

def save_rep(rep, name):
    p = os.path.join(out_dir, f'{name}.png')
    data = rep.representationUsingType_properties_(NSPNGFileType, {})
    data.writeToFile_atomically_(p, True)
    print(f'Generated {name}.png ({os.path.getsize(p)} bytes)')

# ─────────────────────────────────────────────────────────────────────────────
# Geometry & Shading Utilities
# ─────────────────────────────────────────────────────────────────────────────
def point_in_polygon(x, y, poly):
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(1, n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def dist_to_segment(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    l2 = dx*dx + dy*dy
    if l2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1)*dx + (py - y1)*dy) / l2))
    return math.hypot(px - (x1 + t*dx), py - (y1 + t*dy))

def dist_to_poly_boundary(px, py, poly):
    min_d = 1e9
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        d = dist_to_segment(px, py, x1, y1, x2, y2)
        if d < min_d:
            min_d = d
    return min_d

# Sample real diamond brilliance noise from Round Brilliant
def get_ref_brilliance(norm_u, norm_v):
    sx = int(175 + norm_u * 38.0)
    sy = int(135 + norm_v * 38.0)
    sx = max(135, min(215, sx))
    sy = max(95, min(175, sy))
    c = ref_rep.colorAtX_y_(sx, sy)
    lum = 0.299 * c.redComponent() + 0.587 * c.greenComponent() + 0.114 * c.blueComponent()
    return min(1.0, max(0.0, (lum - 0.22) * 1.35))

# ─────────────────────────────────────────────────────────────────────────────
# 1. REFERENCE STONES (10 Shapes directly from photo + All Shapes)
# ─────────────────────────────────────────────────────────────────────────────
def extract_ref_stone(cx, cy, mask_fn, name, target_scale=1.25, contrast_boost=1.05):
    out_rep = make_rep()
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = (x - OUT_CENTER) / target_scale
            dy = (y - OUT_CENTER) / target_scale
            
            inside, edge_factor = mask_fn(dx, dy)
            if not inside or edge_factor <= 0.0:
                out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                continue
                
            sx = int(cx + dx)
            sy = int(cy + dy)
            sx = max(0, min(w_ref - 1, sx))
            sy = max(0, min(h_ref - 1, sy))
            
            c = ref_rep.colorAtX_y_(sx, sy)
            r, g, b = c.redComponent(), c.greenComponent(), c.blueComponent()
            
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 0.23:
                pixel_alpha = 0.0
            elif lum < 0.32:
                pixel_alpha = (lum - 0.23) / 0.09
            else:
                pixel_alpha = 1.0
                
            alpha = edge_factor * pixel_alpha
            if alpha <= 0.01:
                out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                continue
                
            clum = min(1.0, max(0.0, (lum - 0.20) * 1.30 * contrast_boost))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
            
    save_rep(out_rep, name)

# Masks for Reference Stones
def mask_round(dx, dy):
    dist = math.hypot(dx, dy)
    R = 43.5
    if dist <= R - 1.5: return True, 1.0
    if dist <= R + 1.5: return True, max(0.0, (R + 1.5 - dist) / 3.0)
    return False, 0.0

def mask_princess(dx, dy):
    ax, ay = abs(dx), abs(dy)
    S = 40.0
    if ax <= S - 1.5 and ay <= S - 1.5: return True, 1.0
    if ax <= S + 1.5 and ay <= S + 1.5:
        edge = min((S + 1.5 - ax) / 3.0, (S + 1.5 - ay) / 3.0)
        return True, max(0.0, min(1.0, edge))
    return False, 0.0

def mask_oval(dx, dy):
    rx, ry = 36.0, 48.0
    val = (dx/rx)**2 + (dy/ry)**2
    if val <= 0.95: return True, 1.0
    if val <= 1.06: return True, max(0.0, (1.06 - val) / 0.11)
    return False, 0.0

def mask_marquise(dx, dy):
    rx, ry = 52.0, 26.0
    if abs(dx) > rx: return False, 0.0
    y_max = ry * (1.0 - (dx/rx)**2)
    if abs(dy) <= y_max - 1.0: return True, 1.0
    if abs(dy) <= y_max + 1.5: return True, max(0.0, (y_max + 1.5 - abs(dy)) / 2.5)
    return False, 0.0

def mask_emerald(dx, dy):
    ax, ay = abs(dx), abs(dy)
    W, H = 34.0, 46.0
    C = 14.0
    if ax <= W and ay <= H and (ax + ay <= W + H - C):
        return True, 1.0
    if ax <= W + 1.5 and ay <= H + 1.5 and (ax + ay <= W + H - C + 2.0):
        return True, 0.5
    return False, 0.0

def mask_heart(dx, dy):
    nx = dx / 40.0
    ny = -dy / 40.0 + 0.25
    if abs(nx) > 1.2 or ny < -1.1 or ny > 1.2: return False, 0.0
    f = (nx*nx + ny*ny - 1.0)**3 - nx*nx * (ny**3)
    if f <= 0.05: return True, 1.0
    if f <= 0.25: return True, max(0.0, (0.25 - f) / 0.20)
    return False, 0.0

def mask_pear(dx, dy):
    if dy < -46 or dy > 46: return False, 0.0
    if dy >= 0:
        val = (dx / 36.0)**2 + (dy / 38.0)**2
        if val <= 0.95: return True, 1.0
        if val <= 1.05: return True, max(0.0, (1.05 - val) / 0.10)
        return False, 0.0
    else:
        t = (dy + 46) / 46.0
        x_max = 36.0 * (t ** 0.82)
        if abs(dx) <= x_max - 1.5: return True, 1.0
        if abs(dx) <= x_max + 1.5: return True, max(0.0, (x_max + 1.5 - abs(dx)) / 3.0)
        return False, 0.0

def mask_cushion(dx, dy):
    W, H, p = 36.0, 48.0, 2.6
    val = (abs(dx)/W)**p + (abs(dy)/H)**p
    if val <= 0.94: return True, 1.0
    if val <= 1.06: return True, max(0.0, (1.06 - val) / 0.12)
    return False, 0.0

def mask_sq_cushion(dx, dy):
    S, p = 40.0, 2.6
    val = (abs(dx)/S)**p + (abs(dy)/S)**p
    if val <= 0.94: return True, 1.0
    if val <= 1.06: return True, max(0.0, (1.06 - val) / 0.12)
    return False, 0.0

def mask_asscher(dx, dy):
    ax, ay = abs(dx), abs(dy)
    S = 40.0
    C = 14.0
    if ax <= S and ay <= S and (ax + ay <= S * 2 - C):
        return True, 1.0
    if ax <= S + 1.5 and ay <= S + 1.5 and (ax + ay <= S * 2 - C + 2.0):
        return True, 0.5
    return False, 0.0

print('Extracting reference stones...')
extract_ref_stone(175, 135, mask_round, 'round', 1.25)
extract_ref_stone(175, 135, mask_round, 'all-shapes', 1.25)
extract_ref_stone(315, 135, mask_princess, 'princess', 1.25)
extract_ref_stone(458, 130, mask_oval, 'oval', 1.25)
extract_ref_stone(102, 275, mask_marquise, 'marquise', 1.25)
extract_ref_stone(240, 260, mask_emerald, 'emerald', 1.25)
extract_ref_stone(385, 258, mask_heart, 'heart', 1.25)
extract_ref_stone(518, 265, mask_pear, 'pear', 1.25)
extract_ref_stone(170, 390, mask_cushion, 'cushion', 1.25)
extract_ref_stone(310, 395, mask_sq_cushion, 'square-cushion', 1.25)
extract_ref_stone(447, 400, mask_asscher, 'asscher', 1.25)

# ─────────────────────────────────────────────────────────────────────────────
# 2. ISOLATED SINGLE BAGUETTE & TAPERED BAGUETTE
# ─────────────────────────────────────────────────────────────────────────────
def extract_single_baguettes():
    for is_tapered in [False, True]:
        out_rep = make_rep()
        cx, cy = 814, 265
        name = 'tapered-baguette' if is_tapered else 'baguette'
        
        H_half = 46.0
        W_half = 17.0
        
        for y in range(SIZE):
            for x in range(SIZE):
                dy = y - OUT_CENTER
                dx = x - OUT_CENTER
                
                if abs(dy) > H_half + 1.5:
                    out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                    continue
                    
                if is_tapered:
                    t = (dy + H_half) / (2.0 * H_half)
                    cur_w = W_half * (1.15 - 0.45 * t)
                else:
                    cur_w = W_half
                    
                ax = abs(dx)
                if ax > cur_w + 1.5:
                    out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                    continue
                    
                edge_x = max(0.0, min(1.0, (cur_w + 1.5 - ax) / 2.0))
                edge_y = max(0.0, min(1.0, (H_half + 1.5 - abs(dy)) / 2.0))
                edge = edge_x * edge_y
                
                norm_x = dx / cur_w
                norm_y = dy / H_half
                sx = int(cx + norm_x * 12.0)
                sy = int(cy + norm_y * 42.0)
                sx = max(800, min(828, sx))
                sy = max(222, min(308, sy))
                
                c = matched_rep.colorAtX_y_(sx, sy)
                r, g, b = c.redComponent(), c.greenComponent(), c.blueComponent()
                
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum < 0.23:
                    alpha = 0.0
                elif lum < 0.32:
                    alpha = edge * ((lum - 0.23) / 0.09)
                else:
                    alpha = edge
                    
                clum = min(1.0, max(0.0, (lum - 0.18) * 1.35))
                table_w = cur_w * 0.55
                table_h = H_half * 0.60
                dist_table = min(abs(ax - table_w), abs(abs(dy) - table_h))
                if dist_table < 1.0 and ax <= table_w and abs(dy) <= table_h:
                    clum = min(1.0, clum + 0.10)
                    
                out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
                
        save_rep(out_rep, name)

print('Extracting baguettes...')
extract_single_baguettes()

# ─────────────────────────────────────────────────────────────────────────────
# 3. RADIANT CUT & SQUARE RADIANT CUT (Crushed-Ice Octagonal Brilliant Cut)
# ─────────────────────────────────────────────────────────────────────────────
def render_radiant(is_square=False):
    out_rep = make_rep()
    name = 'square-radiant' if is_square else 'radiant'
    
    W = 42.0 if is_square else 37.0
    H = 42.0 if is_square else 48.0
    C = 13.0
    
    poly = [
        (-W + C, -H), (W - C, -H), (W, -H + C), (W, H - C),
        (W - C, H), (-W + C, H), (-W, H - C), (-W, -H + C)
    ]
    
    tW, tH, tC = W * 0.52, H * 0.52, C * 0.52
    table_poly = [
        (-tW + tC, -tH), (tW - tC, -tH), (tW, -tH + tC), (tW, tH - tC),
        (tW - tC, tH), (-tW + tC, tH), (-tW, tH - tC), (-tW, -tH + tC)
    ]
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - OUT_CENTER
            dy = y - OUT_CENTER
            
            inside = point_in_polygon(dx, dy, poly)
            d_edge = dist_to_poly_boundary(dx, dy, poly)
            
            if not inside:
                if d_edge <= 1.5:
                    alpha = max(0.0, (1.5 - d_edge) / 1.5)
                else:
                    out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                    continue
            else:
                alpha = min(1.0, d_edge / 1.5) if d_edge < 1.5 else 1.0
                
            norm_u = dx / W
            norm_v = dy / H
            brilliance = get_ref_brilliance(norm_u, norm_v)
            
            in_table = point_in_polygon(dx, dy, table_poly)
            d_table_edge = dist_to_poly_boundary(dx, dy, table_poly)
            
            angle = math.atan2(dy, dx)
            ray = 0.5 + 0.5 * math.cos(angle * 8.0)
            corner_ray = 0.5 + 0.5 * math.cos(angle * 4.0 + math.pi/4.0)
            
            if in_table:
                lum = 0.46 + 0.25 * brilliance + 0.08 * corner_ray
                if d_table_edge < 1.2:
                    lum += 0.10
            else:
                dist_norm = math.hypot(norm_u, norm_v)
                lum = 0.40 + 0.28 * brilliance + 0.12 * ray + 0.06 * math.sin(dist_norm * 14.0)
                
            clum = min(1.0, max(0.05, lum))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
            
    save_rep(out_rep, name)

print('Rendering Radiant & Square Radiant...')
render_radiant(is_square=False)
render_radiant(is_square=True)

# ─────────────────────────────────────────────────────────────────────────────
# 4. TRILLIANT & TRIANGLE CUT (100% COLORLESS D-FLAWLESS BRILLIANT)
# ─────────────────────────────────────────────────────────────────────────────
def render_trilliant():
    out_rep = make_rep()
    cy = 11.0
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - OUT_CENTER
            dy = y - OUT_CENTER
            
            if dy > 36 or dy < -45:
                out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                continue
                
            t_y = (34.0 - dy) / 76.0
            w_max = 44.0 * (1.0 - t_y) + 4.5 * math.sin(t_y * math.pi)
            
            ax = abs(dx)
            if ax > w_max + 1.5 or dy > 34.0 + 3.0 * (1.0 - (ax/44.0)**2) + 1.5:
                out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                continue
                
            edge_x = max(0.0, min(1.0, (w_max + 1.5 - ax) / 2.0))
            edge_y = max(0.0, min(1.0, (34.0 + 3.0 * (1.0 - (ax/44.0)**2) + 1.5 - dy) / 2.0))
            edge = edge_x * edge_y
            
            norm_u = dx / 44.0
            norm_v = (dy - cy) / 44.0
            brilliance = get_ref_brilliance(norm_u, norm_v)
            
            angle = math.atan2(dy - cy, dx)
            tri_ray = 0.5 + 0.5 * math.cos(angle * 3.0 - math.pi/2.0)
            inner_facet = 0.5 + 0.5 * math.cos(angle * 6.0)
            
            dist_c = math.hypot(dx, dy - cy)
            in_table = (dist_c <= 18.0) and (ax <= (18.0 - (dy - cy)) * 0.75)
            
            if in_table:
                lum = 0.48 + 0.24 * brilliance + 0.08 * tri_ray
            else:
                lum = 0.40 + 0.28 * brilliance + 0.12 * tri_ray + 0.06 * inner_facet
                
            clum = min(1.0, max(0.08, lum))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, edge), x, y)
            
    save_rep(out_rep, 'trilliant')

def render_triangle():
    out_rep = make_rep()
    poly = [(0, -44), (44, 34), (-44, 34)]
    cy = 8.0
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - OUT_CENTER
            dy = y - OUT_CENTER
            
            inside = point_in_polygon(dx, dy, poly)
            d_edge = dist_to_poly_boundary(dx, dy, poly)
            
            if not inside:
                if d_edge <= 1.5:
                    alpha = max(0.0, (1.5 - d_edge) / 1.5)
                else:
                    out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                    continue
            else:
                alpha = min(1.0, d_edge / 1.5) if d_edge < 1.5 else 1.0
                
            norm_u = dx / 44.0
            norm_v = (dy - cy) / 44.0
            brilliance = get_ref_brilliance(norm_u, norm_v)
            
            angle = math.atan2(dy - cy, dx)
            tri_ray = 0.5 + 0.5 * math.cos(angle * 3.0 - math.pi/2.0)
            inner_ray = 0.5 + 0.5 * math.cos(angle * 6.0)
            
            dist_c = math.hypot(dx, dy - cy)
            in_table = (dist_c <= 16.0) and (abs(dx) <= (16.0 - (dy - cy)) * 0.70)
            
            if in_table:
                lum = 0.48 + 0.24 * brilliance + 0.08 * tri_ray
            else:
                lum = 0.38 + 0.30 * brilliance + 0.12 * tri_ray + 0.06 * inner_ray
                
            clum = min(1.0, max(0.08, lum))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
            
    save_rep(out_rep, 'triangle')

print('Rendering Trilliant & Triangle...')
render_trilliant()
render_triangle()

# ─────────────────────────────────────────────────────────────────────────────
# 5. ROSE CUT (Antique 24-Facet Domed Triangular Crown)
# ─────────────────────────────────────────────────────────────────────────────
def render_rose_cut():
    out_rep = make_rep()
    R = 43.0
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - OUT_CENTER
            dy = y - OUT_CENTER
            
            dist = math.hypot(dx, dy)
            if dist > R + 1.5:
                out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                continue
                
            alpha = 1.0 if dist <= R - 1.5 else max(0.0, (R + 1.5 - dist) / 3.0)
            
            angle = math.atan2(dy, dx)
            tier1 = 0.5 + 0.5 * math.cos(angle * 6.0)
            tier2 = 0.5 + 0.5 * math.cos(angle * 12.0 + math.pi/6.0)
            
            norm_u = dx / R
            norm_v = dy / R
            brilliance = get_ref_brilliance(norm_u, norm_v)
            
            z_factor = math.sqrt(max(0.0, 1.0 - (dist / R)**2))
            
            if dist <= 22.0:
                lum = 0.46 + 0.24 * brilliance + 0.10 * tier1 + 0.08 * z_factor
            else:
                lum = 0.38 + 0.28 * brilliance + 0.12 * tier2 + 0.06 * z_factor
                
            facet_line = math.sin(angle * 6.0)**6
            if facet_line < 0.02 and dist <= 24.0:
                lum += 0.12
                
            clum = min(1.0, max(0.08, lum))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
            
    save_rep(out_rep, 'rose-cut')

print('Rendering Rose Cut...')
render_rose_cut()

# ─────────────────────────────────────────────────────────────────────────────
# 6. KITE CUT (Deltoid 4-Sided Symmetrical Brilliant Cut)
# ─────────────────────────────────────────────────────────────────────────────
def render_kite():
    out_rep = make_rep()
    poly = [(0, -48), (36, -8), (0, 48), (-36, -8)]
    table_poly = [(0, -26), (18, -6), (0, 24), (-18, -6)]
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - OUT_CENTER
            dy = y - OUT_CENTER
            
            inside = point_in_polygon(dx, dy, poly)
            d_edge = dist_to_poly_boundary(dx, dy, poly)
            
            if not inside:
                if d_edge <= 1.5:
                    alpha = max(0.0, (1.5 - d_edge) / 1.5)
                else:
                    out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                    continue
            else:
                alpha = min(1.0, d_edge / 1.5) if d_edge < 1.5 else 1.0
                
            norm_u = dx / 36.0
            norm_v = dy / 48.0
            brilliance = get_ref_brilliance(norm_u, norm_v)
            
            in_table = point_in_polygon(dx, dy, table_poly)
            d_table_edge = dist_to_poly_boundary(dx, dy, table_poly)
            
            angle = math.atan2(dy, dx)
            kite_ray = 0.5 + 0.5 * math.cos(angle * 4.0 + math.pi/4.0)
            lower_split = 0.5 + 0.5 * math.cos(dx * 0.4) if dy > -8 else 0.5
            
            if in_table:
                lum = 0.48 + 0.24 * brilliance + 0.08 * kite_ray
                if d_table_edge < 1.2: lum += 0.10
            else:
                lum = 0.38 + 0.30 * brilliance + 0.12 * kite_ray + 0.06 * lower_split
                
            clum = min(1.0, max(0.08, lum))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
            
    save_rep(out_rep, 'kite')

print('Rendering Kite...')
render_kite()

# ─────────────────────────────────────────────────────────────────────────────
# 7. TAPERED BULLET CUT (5-Sided Step-Cut with Flat Top & V-Point Bottom)
# ─────────────────────────────────────────────────────────────────────────────
def render_tapered_bullet():
    out_rep = make_rep()
    poly = [(-28, -44), (28, -44), (28, -6), (0, 46), (-28, -6)]
    table_poly = [(-15, -24), (15, -24), (15, -6), (0, 22), (-15, -6)]
    
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - OUT_CENTER
            dy = y - OUT_CENTER
            
            inside = point_in_polygon(dx, dy, poly)
            d_edge = dist_to_poly_boundary(dx, dy, poly)
            
            if not inside:
                if d_edge <= 1.5:
                    alpha = max(0.0, (1.5 - d_edge) / 1.5)
                else:
                    out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0, 0, 0, 0), x, y)
                    continue
            else:
                alpha = min(1.0, d_edge / 1.5) if d_edge < 1.5 else 1.0
                
            norm_u = dx / 28.0
            norm_v = dy / 46.0
            brilliance = get_ref_brilliance(norm_u, norm_v)
            
            in_table = point_in_polygon(dx, dy, table_poly)
            d_table_edge = dist_to_poly_boundary(dx, dy, table_poly)
            
            step_band = math.sin(d_edge * 0.85)**2
            
            if in_table:
                lum = 0.48 + 0.22 * brilliance + 0.08 * step_band
                if d_table_edge < 1.2: lum += 0.10
            else:
                lum = 0.38 + 0.28 * brilliance + 0.12 * step_band
                
            clum = min(1.0, max(0.08, lum))
            out_rep.setColor_atX_y_(NSColor.colorWithCalibratedRed_green_blue_alpha_(clum, clum, clum, alpha), x, y)
            
    save_rep(out_rep, 'tapered-bullet')

print('Rendering Tapered Bullet...')
render_tapered_bullet()

print('=== ALL 20 PERFECT DIAMONDS COMPLETED! ===')
