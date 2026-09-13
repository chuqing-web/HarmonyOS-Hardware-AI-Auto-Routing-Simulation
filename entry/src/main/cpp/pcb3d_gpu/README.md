# PCB GPU 3D（预备目录）

后续在此落地：

- `CMakeLists.txt` + `napi_init.cpp`
- EGL / OpenGL ES 3.x 上下文（XComponent Surface）
- PBR 着色器（IBL + 阴影贴图）
- 网格 / 纹理上传（来自 `Pcb3dMeshBuilder` / 板面烘焙）

当前应用已通过增强 CPU PBR + 阻焊开窗对齐嘉立创观感；Native 模块就绪后由 `Pcb3dGpuBridge` 切换。
