import * as path from 'path';
import * as fs from 'fs';

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  resolved?: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
  hasClaudeDir: boolean;
}

/**
 * PathValidator - 验证路径权限和列出项目
 */
export class PathValidator {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * 验证路径是否在根目录下
   */
  validate(requestedPath: string): PathValidationResult {
    try {
      const resolved = path.resolve(requestedPath);
      const root = this.rootDir;

      // 检查是否在根目录下
      if (!resolved.startsWith(root)) {
        return {
          valid: false,
          error: `Access denied: ${requestedPath} is outside root directory ${this.rootDir}`
        };
      }

      // 检查路径是否存在
      if (!fs.existsSync(resolved)) {
        return {
          valid: false,
          error: `Path does not exist: ${requestedPath}`
        };
      }

      return {
        valid: true,
        resolved
      };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid path: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 列出根目录下的所有项目
   * 项目定义：包含.claude目录的文件夹，或者根目录本身
   */
  async listProjects(): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];

    try {
      // 添加根目录作为默认项目（管家模式）
      const rootHasClaudeDir = fs.existsSync(path.join(this.rootDir, '.claude'));
      projects.push({
        name: '🏠 根目录',
        path: this.rootDir,
        hasClaudeDir: rootHasClaudeDir
      });

      // 递归查找包含.claude目录的子目录
      await this.scanDirectory(this.rootDir, projects, 0, 3); // 最多扫描3层

      return projects;
    } catch (error) {
      console.error('Failed to list projects:', error);
      return projects; // 至少返回根目录
    }
  }

  /**
   * 递归扫描目录查找项目
   */
  private async scanDirectory(
    dir: string,
    projects: ProjectInfo[],
    depth: number,
    maxDepth: number
  ): Promise<void> {
    if (depth >= maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // 跳过隐藏目录和node_modules等
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          const claudeDir = path.join(fullPath, '.claude');

          // 如果包含.claude目录，添加为项目
          if (fs.existsSync(claudeDir)) {
            projects.push({
              name: entry.name,
              path: fullPath,
              hasClaudeDir: true
            });
          }

          // 继续递归扫描子目录
          await this.scanDirectory(fullPath, projects, depth + 1, maxDepth);
        }
      }
    } catch (error) {
      // 跳过无权限访问的目录
      console.warn(`Cannot scan directory ${dir}:`, error);
    }
  }

  /**
   * 获取根目录路径
   */
  getRootDir(): string {
    return this.rootDir;
  }
}
