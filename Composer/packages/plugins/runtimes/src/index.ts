// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import rimraf from 'rimraf';
import { execSync } from 'child_process';
const exec = promisify(require('child_process').exec);

import { ComposerPluginRegistration } from '@bfc/plugin-loader';
import { copyDir } from './copyDir';
import { IFileStorage } from './interface';

const removeDirAndFiles = promisify(rimraf);

export default async (composer: ComposerPluginRegistration): Promise<void> => {
  // register the bundled c# runtime used by the local publisher with the eject feature
  composer.addRuntimeTemplate({
    key: 'csharp-azurewebapp',
    name: 'C#',
    startCommand: 'dotnet run --project azurewebapp',
    path: path.resolve(__dirname, '../../../../../runtime/dotnet'),
    build: async (runtimePath: string, _project: any) => {
      // // copy source into temporary folder
      // copyDir(path.resolve(__dirname, '../../../../../runtime/dotnet'), runtimePath);
      // do stuff
      console.log(`BUILD THIS C# PROJECT! at ${runtimePath}...`);
      // TODO: capture output of this and store it somewhere useful
      execSync('dotnet user-secrets init --project azurewebapp', { cwd: runtimePath, stdio: 'pipe' });
      execSync('dotnet build', { cwd: runtimePath, stdio: 'pipe' });
      console.log('FINISHED BUILDING!');
    },
    run: async (project: any, localDisk: IFileStorage) => {
      // do stuff
      console.log('RUN THIS C# PROJECT!');
    },
    buildDeploy: async (runtimePath: string, project: any, profileName: string): Promise<string> => {
      console.log('BUILD FOR DEPLOY TO AZURE!');

      let csproj = '';
      // find publishing profile in list
      const profile = project.settings.publishTargets.find((p) => p.name === profileName);
      if (profile.type === '@bfc/plugin-azure-publish') {
        csproj = 'Microsoft.BotFramework.Composer.WebApp.csproj';
      } else if (profile.type === '@bfc/plugin-azure-functions-publish') {
        csproj = 'Microsoft.BotFramework.Composer.Functions.csproj';
      }
      const publishFolder = path.join(runtimePath, 'bin', 'Release', 'netcoreapp3.1');
      const deployFilePath = path.join(runtimePath, '.deployment');
      const dotnetProjectPath = path.join(runtimePath, csproj);

      // Check for existing .deployment file, if missing, write it.
      if (!fs.pathExistsSync(deployFilePath)) {
        const data = `[config]\nproject = ${csproj}`;

        fs.writeFileSync(deployFilePath, data);
      }

      // do the dotnet publish
      try {
        const { stdout, stderr } = await exec(
          `dotnet publish "${dotnetProjectPath}" -c release -o "${publishFolder}" -v q`,
          {
            cwd: runtimePath,
          }
        );
        console.log('OUTPUT FROM BUILD', stdout);
        console.log('ERR FROM BUILD: ', stderr);
      } catch (err) {
        console.error('Error doing dotnet publish', err);
        throw err;
        return;
      }
      // Then, copy the declarative assets into the build artifacts folder.
      const remoteBotPath = path.join(publishFolder, 'ComposerDialogs');
      const localBotPath = path.join(runtimePath, 'ComposerDialogs');
      await fs.copy(localBotPath, remoteBotPath, {
        overwrite: true,
        recursive: true,
      });

      console.log('BUILD FOR DELPOY COMPLETE!');
      // return the location of the build artifiacts
      return publishFolder;
    },
    eject: async (project, localDisk: IFileStorage) => {
      const sourcePath = path.resolve(__dirname, '../../../../../runtime/dotnet');
      const destPath = path.join(project.dir, 'runtime');
      if (!(await project.fileStorage.exists(destPath))) {
        // used to read bot project template from source (bundled in plugin)
        await copyDir(sourcePath, localDisk, destPath, project.fileStorage);
        const schemaDstPath = path.join(project.dir, 'schemas');
        const schemaSrcPath = path.join(sourcePath, 'azurewebapp/schemas');
        const customSchemaExists = fs.existsSync(schemaDstPath);
        const pathsToExclude: Set<string> = new Set();
        if (customSchemaExists) {
          const sdkExcludePath = await localDisk.glob('sdk.schema', schemaSrcPath);
          if (sdkExcludePath.length > 0) {
            pathsToExclude.add(path.join(schemaSrcPath, sdkExcludePath[0]));
          }
        }
        await copyDir(schemaSrcPath, localDisk, schemaDstPath, project.fileStorage, pathsToExclude);
        const schemaFolderInRuntime = path.join(destPath, 'azurewebapp/schemas');
        await removeDirAndFiles(schemaFolderInRuntime);
        return destPath;
      }
      throw new Error(`Runtime already exists at ${destPath}`);
    },
  });

  composer.addRuntimeTemplate({
    key: 'javescript-azurewebapp',
    name: 'JS',
    startCommand: 'node azurewebapp/lib/index.js',
    path: path.resolve(__dirname, '../../../../../runtime/node'),
    build: async (runtimePath: string, _project: any) => {
      // do stuff
      console.log('BUILD THIS JS PROJECT');
      execSync('npm install', { cwd: path.join(runtimePath, '/core'), stdio: 'pipe' });
      execSync('npm install', { cwd: path.join(runtimePath, '/azurewebapp'), stdio: 'pipe' });
      console.log('BUILD COMPLETE');
    },
    run: async (project: any, localDisk: IFileStorage) => {
      // do stuff
    },
    buildDeploy: async (runtimePath: string, project: any): Promise<string> => {
      // do stuff
      console.log('BUILD THIS JS PROJECT');
      execSync('npm install', { cwd: path.join(runtimePath, '/core'), stdio: 'pipe' });
      execSync('npm install', { cwd: path.join(runtimePath, '/azurewebapp'), stdio: 'pipe' });
      console.log('BUILD COMPLETE');
      return '';
    },
    eject: async (project: any, localDisk: IFileStorage) => {
      const sourcePath = path.resolve(__dirname, '../../../../../runtime/node');
      const destPath = path.join(project.dir, 'runtime');
      // const schemaSrcPath = path.join(sourcePath, 'azurewebapp/Schemas');
      // const schemaDstPath = path.join(project.dir, 'schemas');
      if (!(await project.fileStorage.exists(destPath))) {
        // used to read bot project template from source (bundled in plugin)
        await copyDir(sourcePath, localDisk, destPath, project.fileStorage);
        // await copyDir(schemaSrcPath, localDisk, schemaDstPath, project.fileStorage);
        return destPath;
      } else {
        throw new Error(`Runtime already exists at ${destPath}`);
      }
    },
  });
};
