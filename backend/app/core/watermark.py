from pathlib import Path
import cv2
import numpy as np
import logging

def remove_watermark_opencv(src_path: Path, x: int, y: int, w: int, h: int, radius: int = 5, method: str = "telea") -> Path:
    """
    使用 OpenCV 的 inpaint 算法进行高级去水印。
    """
    # OpenCV 默认读取为 BGR
    img = cv2.imread(str(src_path), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取图片文件: {src_path}")

    h_img, w_img = img.shape[:2]

    # 坐标边界检查与修正 (确保不越界)
    x0 = max(0, min(x, w_img - 1))
    y0 = max(0, min(y, h_img - 1))
    x1 = max(0, min(x + w, w_img))
    y1 = max(0, min(y + h, h_img))

    # 创建掩码 (Mask)
    # 0 表示保持原样，255 表示需要修复的区域
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    mask[y0:y1, x0:x1] = 255

    # 选择算法
    # INPAINT_TELEA: 基于快速行进方法 (FMM)
    # INPAINT_NS: 基于流体动力学方程 (Navier-Stokes)
    flag = cv2.INPAINT_TELEA if method.lower() == "telea" else cv2.INPAINT_NS
    
    # 执行修复
    # radius: 算法考虑的每个修复像素周围的邻域半径
    out = cv2.inpaint(img, mask, float(radius), flag)

    # 准备输出目录和路径
    out_dir = src_path.parent.parent / "fixed"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    # 保持原后缀
    out_path = out_dir / f"{src_path.stem}_fixed{src_path.suffix}"
    
    # 写入结果
    success = cv2.imwrite(str(out_path), out)
    if not success:
        raise RuntimeError(f"无法写入修复后的图片到: {out_path}")

    return out_path
