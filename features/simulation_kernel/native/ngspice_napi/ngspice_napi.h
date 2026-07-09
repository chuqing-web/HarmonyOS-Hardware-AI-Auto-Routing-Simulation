#ifndef NGSPICE_NAPI_H
#define NGSPICE_NAPI_H

#ifdef __cplusplus
extern "C" {
#endif

/** 初始化 Ngspice 引擎；成功返回 0 */
int ngspice_napi_init(void);

/** 执行 SPICE 命令字符串 */
int ngspice_napi_command(const char *cmd);

/** 加载网表行数组（以 NULL 结尾） */
int ngspice_napi_circ(char **lines);

/** 读取向量数据到 outValues，返回采样点数 */
int ngspice_napi_get_vector(const char *name, double *outValues, int maxLen);

/** 释放资源 */
void ngspice_napi_destroy(void);

#ifdef __cplusplus
}
#endif

#endif
